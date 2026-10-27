# ShieldNum — Implementation Plan (spec v1.1)

## Assumptions
- The new app is built at the repo root, which matches the spec's `shieldnum/` layout. `index.html` moves to `legacy/` and stays runnable until cutover. The empty `database/` dir is removed in favour of `supabase/`.
- Existing Firestore reports are not migrated automatically, because they were never moderated and their evidence is inline base64. An optional one-off import can bring them in as `pending` with no evidence.
- The 7 existing categories in `index.html:176-182` seed `report_categories`.
- Two small additions to the spec's data model: `reports.public_summary` (the moderator's redacted text, which is the only description shown publicly) and `appeals.kind` (`reporter_appeal | correction_request`). Together they cover the requirements to redact and to let people request correction or removal.

## 0. Principles
- Access control is built and tested **before** the report form is public.
- The browser only ever holds the Supabase anon key. Every privileged action goes through RLS or a `SECURITY DEFINER` SQL function that checks `auth.uid()` and the user's role.
- Public data comes only from a curated function. Nobody, including signed-in users, reads `reports` directly unless a policy allows it.
- The UI never states a verdict. It uses the words "community reports" and "reviewed reports", and shows "No reviewed reports found" when there are none.

## Phase 1 — Foundation
1. Move `index.html` to `legacy/index.html`, update `README.md`, and update `CLAUDE.md` at the end of the project.
2. Run `npm create vite@latest` with react-ts at the root. Add Tailwind, React Router, React Hook Form, Zod, libphonenumber-js, @supabase/supabase-js and @tanstack/react-query.
3. Tooling: ESLint (typescript-eslint and the react-hooks plugin), Prettier, Vitest, React Testing Library and Playwright. Scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `db:test`.
4. Create the folders from spec §9: `src/{components,pages,features/{search,reports,moderation},lib,services,types}`, `supabase/{migrations,functions}`, `tests/` and `docs/SPEC.md` (a copy of the spec).
5. Add `.env.example` with `VITE_SUPABASE_URL=` and `VITE_SUPABASE_ANON_KEY=` only. Add `.env*` (except the example) to `.gitignore`.
6. Run `supabase init`. Local dev uses `supabase start` (Docker).
7. GitHub Actions CI runs lint, typecheck, unit tests and `supabase test db` on each PR.

## Phase 2 — Database and security (`supabase/migrations/`)
**Migration 001_schema.sql**
- Enums: `report_status` (`pending, needs_info, approved, rejected, appealed, removed`), `app_role` (`user, moderator, admin`), `appeal_status` (`open, accepted, denied`), `appeal_kind`, `moderation_action` (`approve, reject, request_info, redact, escalate, remove, restore`).
- Tables, as in spec §5, with UUID PKs (`gen_random_uuid()`), `timestamptz default now()` and FKs:
  - `profiles`: PK is `auth.users.id`. A trigger on `auth.users` insert creates the profile and a `user` role.
  - `user_roles(user_id, role)`: unique on the pair.
  - `phone_numbers`: `normalized_e164` is unique, with a `CHECK (normalized_e164 ~ '^\+8801[3-9][0-9]{8}$')`.
  - `report_categories`: seeded with the 7 legacy categories.
  - `reports`: also has `public_summary text`. Checks: description length 20–2000 and `incident_date <= current_date`.
  - `report_evidence`: `mime_type in (image/jpeg, image/png, image/webp)`, `file_size <= 5 MB`. A trigger limits each report to 3 evidence files.
  - `moderation_actions`, `report_status_history`, `appeals` (with `kind`) and `audit_logs`.
- Indexes on `reports(phone_number_id, status)`, `reports(reporter_id, created_at)`, `reports(status, created_at)` and `appeals(status)`.
- Trigger `updated_at`. Trigger `on status change → insert report_status_history`.

**Migration 002_rls.sql**
- Enable RLS on every table.
- Helpers (`SECURITY DEFINER`, `search_path` pinned): `has_role(role)` and `is_moderator()`, which is true for both moderator and admin.
- Policies:
  - `profiles`: a user can select and update only their own row.
  - `user_roles`: a user can select only their own rows. There are **no** insert, update or delete policies, so roles change only through the admin-only RPC.
  - `reports`: a reporter can select their own rows, and moderators can select all. There is no direct insert or update; writes go through the RPCs.
  - `report_evidence`: the reporter can select their own evidence and moderators can select all. Insert is allowed only for the reporter, only while the report is `pending` or `needs_info`.
  - `moderation_actions`, `report_status_history`, `audit_logs`: moderators can select. The reporter can select the status history of their own reports. Writes happen only through functions.
  - `appeals`: the requester can insert and select their own appeals. Moderators can select and update.
  - `phone_numbers`, `report_categories`: anyone can select active categories. `phone_numbers` can be read only through functions.
- `anon` gets no grants on raw tables, only `EXECUTE` on the public functions.

**Migration 003_functions.sql**
- `search_number(p_e164 text)`: anon and authenticated, `SECURITY DEFINER`. Returns `{ approved_count, categories[], first_reported, last_reported, reports: [{id, category, incident_date, public_summary, reviewed_at}] }` for **approved** reports only. It never returns the reporter, notes, evidence or pending counts.
- `get_public_report(p_id uuid)`: returns the same safe fields if the report is approved, and null otherwise.
- `submit_report(p_phone, p_category_id, p_incident_date, p_description)`: authenticated only. Revalidates the E.164 format and the field rules. Rate limit: at most 5 reports per user per 24 h. Duplicate check: the same user and number within 30 days is rejected. It upserts `phone_numbers`, inserts the report as `pending`, writes `audit_logs` and returns `{id, reference}`.
- `moderate_report(p_id, p_action, p_reason, p_public_summary)`: moderators only. Validates the allowed state transition, updates the status, `reviewed_at` and `public_summary`, and writes `moderation_actions` and `audit_logs` in one transaction. A report cannot be approved without a `public_summary`.
- `submit_appeal(p_report_id, p_kind, p_reason)`: a reporter can appeal their own `rejected` or `removed` report. Any signed-in user can file a `correction_request` on an approved report. A `reporter_appeal` sets the report to `appealed`.
- `resolve_appeal(p_id, p_decision, p_reason)`: moderators only.
- `set_user_role(p_user, p_role)`: admin only, and audited.

**Migration 004_storage.sql**
- Private bucket `evidence` with `file_size_limit 5MB` and `allowed_mime_types` set to jpeg, png and webp.
- Object path: `{auth.uid()}/{report_id}/{uuid}.{ext}`. A user can insert objects only under their own folder and only for their own pending report. Select is allowed for the owner and for moderators. There is no public access.
- Moderators view evidence through `createSignedUrl(path, 60)`.

**Tests for the database (`supabase/tests/*.sql`, pgTAP via `supabase test db`)**. These are written in this phase, before any UI:
- anon cannot select any raw table, and `search_number` returns only approved rows.
- User A cannot read user B's reports or evidence.
- A user cannot insert into `user_roles` or call `moderate_report` or `set_user_role`.
- New reports are created as `pending`. Status changes create history rows and moderation actions.
- Rate-limit and duplicate rejections work.

## Phase 3 — Phone handling and search
- `src/lib/phone.ts`: `toAsciiDigits()` maps ০-৯ to 0-9. `normalizeBDNumber(input)` converts digits, strips spaces, hyphens, brackets and dots, then calls `parsePhoneNumberFromString(x, 'BD')`. The result must be valid and in the BD country, and the function returns `{ ok, e164 } | { ok:false, error }`. It accepts `01XXXXXXXXX`, `8801…`, `+8801…` and `00880…`.
- Unit tests (`src/lib/phone.test.ts`): Bangla digits, mixed separators, each prefix form, invalid lengths, non-BD numbers and landlines (decide whether to accept them; default is mobile only, to match the DB CHECK).
- `src/services/supabase.ts` creates the client. `src/services/search.ts` calls `rpc('search_number')`.
- Pages: `/` has the search box and safety tips. `/search?q=` covers the loading, invalid number, network error, "No reviewed reports found" and results states. Results show the count, categories, dates and summaries with neutral wording and a disclaimer. `/report/:id` shows the public summary.

## Phase 4 — Auth and reports
- Supabase Auth email OTP or magic link. Add `AuthProvider` and `RequireAuth` in `src/features/auth/`, a `/login` page and a sign-out control.
- `/report`: a React Hook Form form with a Zod schema shared in `src/features/reports/schema.ts` (phone through `normalizeBDNumber`, category, incident date no later than today, description 20–2000 chars, up to 3 images, each 5 MB or less, jpeg/png/webp). Before submitting, warn the user not to include personal data.
- Submit flow: call `rpc('submit_report')` to get the id, then upload each file to `evidence/{uid}/{id}/…`, then insert `report_evidence` rows. On success, show the reference and link to `/my-reports`.
- `/my-reports`: the user's own reports, with status badges, status history, moderator-requested info for `needs_info`, and an "Appeal" action on rejected or removed reports.
- Static pages: `/safety`, `/privacy` and `/terms`. `/terms` covers acceptable use, the disclaimer, retention, and how to request a correction or removal or file an appeal. Mark them for legal review.

## Phase 5 — Moderation
- `/admin/reports` is protected by `RequireRole('moderator')`. The route guard is for UX only; RLS is the real enforcement.
- Queue: filter by status (pending first), number, category and date.
- Detail view: report fields, evidence through signed URLs, prior reports for the same number, status history, actions and appeals.
- Actions call `rpc('moderate_report')`. A reason is required for reject, remove and request_info. A `public_summary` editor is required to approve, prefilled with the description for the moderator to redact.
- Appeals tab: a list of appeals, resolved through `rpc('resolve_appeal')`.
- An admin-only roles screen calls `set_user_role`. The first admin is created by hand with SQL in the Supabase dashboard, as documented in the README.

## Phase 6 — Testing
- Unit: `phone.ts`, Zod schemas, status label helpers.
- Component (RTL): every search state, form validation messages, upload limit errors.
- DB (pgTAP): the access-control matrix and state transitions from Phase 2.
- E2E (Playwright against local Supabase, with seeded users for user, moderator and admin):
  1. A user submits a report, which stays pending and does not appear in search.
  2. A moderator approves it with a summary, and it now appears in search.
  3. Another user cannot see it in their reports.
  4. Reject, then appeal, then resolve.
  5. Mobile (375 px) and desktop viewports.
- Accessibility check with `@axe-core/playwright` on the main pages.

## Phase 7 — Deploy
- Create a Supabase Free project and run `supabase db push` for the migrations. Confirm the bucket is private, and turn on email confirmation and the Auth rate limits.
- Cloudflare Pages: connect the GitHub repo, use build `npm run build` with output `dist`, set the `VITE_SUPABASE_*` env vars, and add an SPA fallback through `public/_redirects` (`/* /index.html 200`).
- Production smoke test: run the anon access checks against the prod API with only the anon key.
- Cutover: remove `legacy/` and decommission the Firebase project (`fraud-detector-app-18d4c`), whose config is currently hardcoded in `index.html`. Rotate or restrict that key.
- Optional: a one-off script `scripts/import-firestore.ts`, run locally with the service-role key from env and never committed, imports legacy reports as `pending` without attachments.

## Acceptance checklist mapping (spec §11)
| Item | Covered by |
|---|---|
| BD numbers normalize incl. Bangla digits | `phone.ts` and its unit tests, DB CHECK |
| Invalid numbers rejected clearly | `/search` and form errors, `submit_report` check |
| Public search only approved and redacted | `search_number` with `public_summary`, pgTAP |
| New reports private and pending | `submit_report`, RLS, E2E 1 |
| No cross-user reads | RLS on reports, evidence and storage, pgTAP, E2E 3 |
| No self-granted roles | No write policies on `user_roles`, admin-only RPC |
| Auditable moderation | `moderation_actions`, status-history trigger, `audit_logs` |
| Upload type and size limits | Zod, bucket limits, table CHECK, 3-file trigger |
| No secrets shipped | anon key only, `.env.example`, CI secret scan (gitleaks action) |
| Mobile and desktop | Playwright viewports |
| Policies published | `/privacy`, `/terms`, `/safety` |

## Open decisions (defaults chosen)
- Mobile numbers only (`+8801[3-9]…`). Landlines can be added later.
- Rate limit of 5 reports per day and a 30-day duplicate window, both tunable in `submit_report`.
- No CAPTCHA at first. Cloudflare Turnstile (free) can be added if abuse appears.

