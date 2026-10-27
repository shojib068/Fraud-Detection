# ShieldNum — Implementation Plan (spec v1.1, revision 4)

Revision 2 removed Docker and added realtime updates. Revision 3 added admin tools to delete users and numbers and to reset passwords. Revision 4 settles accounts on **email + password with email verification**: sign up, click the verification link, then sign in with email and password. The app runs with `npm run dev` in the browser against a **hosted Supabase project**. Postgres, Auth, Storage and Realtime all run in Supabase's cloud, so a developer needs only Node.

## How to run
1. Create a free project at supabase.com.
2. `npm install`
3. Apply the database:
   - `npx supabase login`
   - `npx supabase link --project-ref <ref>`
   - `npx supabase db push`

   None of these need Docker. You can also paste `supabase/migrations/*.sql` into the dashboard SQL editor, in order.
4. In the dashboard:
   - Authentication → Sign In / Providers → Email: keep **Confirm email** on.
   - URL Configuration: set the Site URL to `http://localhost:5173` and add the Redirect URL `http://localhost:5173/**`.
5. Copy `.env.example` to `.env.local` and fill in the project URL and anon (publishable) key.
6. `npm run dev`, open http://localhost:5173, sign up, and click the verification link in the email.
7. Make yourself admin in the SQL editor: `insert into public.user_roles (user_id, role) select id, 'admin' from auth.users where email = '<you>';`

## Assumptions
- The new app is built at the repo root, which matches the spec's `shieldnum/` layout. `index.html` moves to `legacy/` and stays runnable until cutover.
- Existing Firestore reports are not migrated automatically, because they were never moderated and their evidence is inline base64. An optional one-off import can bring them in as `pending` with no evidence.
- The 7 existing categories in the legacy form seed `report_categories`.
- Additions to the spec's data model:
  - `reports.public_summary`: the moderator's redacted text, and the only description shown publicly.
  - `appeals.kind`: `reporter_appeal` or `correction_request`.
  - `public_reports` and `report_updates`: small trigger-maintained tables for Realtime (see Phase 5).
- **No Docker, anywhere.**
  - Development and production both use a hosted Supabase project.
  - Database tests run in PGlite, which is Postgres compiled to WebAssembly and runs in-process in Node.

## 0. Principles
- Access control is built and tested **before** the report form is public.
- The browser only ever holds the Supabase anon key. Every privileged action goes through RLS or a `SECURITY DEFINER` SQL function that checks `auth.uid()` and the user's role.
- Public data comes only from curated functions and tables containing approved, redacted fields.
- Realtime never widens access. Subscriptions only deliver rows the user may already `select`, and the app reloads data through the same RPCs instead of trusting payloads.
- The UI never states a verdict. It uses "community reports" and "reviewed reports", and shows "No reviewed reports found" when there are none.

## Phase 1 — Foundation
1. Move `index.html` to `legacy/index.html`. Update `README.md` and `CLAUDE.md`.
2. Set up a Vite React + TypeScript app at the root, with:
   - Tailwind v4
   - React Router
   - React Hook Form and Zod
   - libphonenumber-js
   - @supabase/supabase-js
   - @tanstack/react-query
3. Tooling: ESLint, Prettier, Vitest, React Testing Library, Playwright, and `@electric-sql/pglite` for database tests. Scripts: `dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `db:test`.
4. Create the folders from spec §9 plus `scripts/` (test runner) and `docs/SPEC.md`.
5. Add `.env.example` with placeholders only. Git ignores every other `.env*` file.
6. Use the Supabase CLI (an npm dev dependency) only for `login`, `link` and `db push`. Seeding is disabled in `supabase/config.toml`.
7. GitHub Actions CI runs lint, typecheck, unit tests, `db:test` (PGlite), build, Playwright smoke tests and a gitleaks secret scan. No Docker job.

## Phase 2 — Database and security (`supabase/migrations/`)
**`…01_schema.sql`**
- Enums: `report_status`, `app_role`, `appeal_status`, `appeal_kind`, `moderation_action`.
- Tables from spec §5:
  - UUID primary keys and `timestamptz` timestamps.
  - CHECKs on the E.164 format, description length (20–2000), incident date, and evidence type and size (5 MB).
  - A trigger limiting each report to 3 evidence files.
- Triggers:
  - a new auth user gets a `profiles` row and the `user` role
  - `updated_at`
  - a status change inserts into `report_status_history`
- Indexes on the queue, the reporter and the number lookups.

**`…02_rls.sql`**
- RLS on every table, and table grants revoked from `anon`/`authenticated` and re-granted narrowly.
- Helpers live in the unexposed `private` schema with a pinned `search_path`: `has_role`, `is_moderator`, `is_admin`, `owns_report`, `can_attach_evidence`.
  - A helper used by a policy must be granted to every role that hits that policy. For example, `is_moderator` is granted to `anon`.
- Who can read what:
  - Moderators can read `reports`, numbers, history, actions and audit logs.
  - Reporters cannot read `reports` directly. They use `my_reports()`, which leaves out `moderator_note`.
  - Evidence: the owner can insert while the report is pending or needs info. The owner and moderators can read.
  - `user_roles` has no write policies.

**`…03_functions.sql`**: `SECURITY DEFINER` functions. Each checks the caller and writes audit entries.

| Who can call | Functions |
|---|---|
| Anyone | `search_number`, `get_public_report` |
| Reporters | `submit_report` (rate limit 5 per 24 h, duplicate window 30 days), `my_reports`, `respond_to_info_request`, `submit_appeal` |
| Moderators | `moderate_report` (enforces allowed transitions; publishing requires a summary), `resolve_appeal` |
| Admins | `admin_list_users`, `set_user_role` |

**`…04_storage.sql`**
- Private `evidence` bucket: 5 MB limit, JPEG/PNG/WebP only.
- Objects are stored at `{uid}/{report_id}/{uuid}.{ext}`. Only the owner can upload, and only into their own pending report.
- The owner and moderators can read. Moderators view evidence through 60-second signed URLs.

**`…05_realtime.sql`**: see Phase 5.

## Phase 3 — Phone handling and search
- `src/lib/phone.ts` (unit tested):
  - Converts Bangla digits and strips separators.
  - Parses with libphonenumber-js and accepts BD mobile numbers only.
  - Returns E.164.
- `/` has the search box, safety tips and a **live "Recently reviewed reports" feed**.
- `/search?q=` covers the loading, invalid number, network error, "No reviewed reports found" and results states, and **updates live**.
- `/report/:id` shows the public summary and a correction or removal request form, and **updates live**.

## Phase 4 — Auth and reports
- **Accounts are email + password with email verification**. Sign-up is open, with no admin approval.
  - `/signup` calls `supabase.auth.signUp` with `emailRedirectTo` set to `/login`. Supabase emails a verification link, and **Confirm email** stays on.
  - Clicking the link returns the user signed in.
  - `/login` calls `signInWithPassword`. An unverified email shows "Verify your email first" with a resend button (`auth.resend`).
  - An existing email is detected through Supabase's empty `identities` response.
  - `/account` changes the password. There's no reset-email flow; an admin sets a new password from the Users screen.
  - Supabase's built-in email only reaches project team members, at about 2 per hour. **Custom SMTP** (for example Resend's free tier) is required before public sign-up.
  - Abuse controls are Supabase's sign-up rate limit, email verification, and the per-account report limit. Cloudflare Turnstile is the next step if spam appears.
- `/report`: a React Hook Form form with a shared Zod schema and up to 3 images. Before submitting, it warns the user not to include personal data.
- `/my-reports` shows:
  - status badges and status history
  - the moderator's question, with a reply form, for `needs_info`
  - an appeal form for rejected or removed reports

  The page **updates live** when a moderator acts.
- Static pages: `/safety`, `/privacy`, `/terms`. They are marked for legal review.

## Phase 5 — Realtime (`…05_realtime.sql`, `src/lib/useRealtime.ts`)
Supabase Realtime (`postgres_changes`) only delivers a change to subscribers who may `select` that row under RLS. Anonymous visitors and reporters can't read `reports`, so each gets a trigger-maintained table that is safe for them:

| Table | Contents | Who can read it | Used for |
|---|---|---|---|
| `public_reports` | approved, redacted fields only (`phone_e164`, `category`, `incident_date`, `public_summary`, `reviewed_at`) | everyone | search, report page, home feed |
| `report_updates` | `report_id`, `reporter_id`, `status` | the reporter only | My reports |
| `reports`, `appeals` | existing tables | moderators only | queue, review page, appeals |

- How the two new tables stay in sync:
  - A trigger on `reports` (`private.sync_realtime_tables`) upserts into `public_reports` when the status is `approved` and deletes the row otherwise.
  - The same trigger updates `report_updates` on every status change.
  - Existing rows are backfilled.
- All four tables are added to the `supabase_realtime` publication.
- Client side:
  - `useRealtimeInvalidate({ channel, subscriptions, queryKeys })` subscribes, and on any change refetches the TanStack Query keys through the normal RPCs.
  - On reconnect it refetches to catch up. It removes the channel on unmount.
  - A `LiveIndicator` shows "Live" or "Reconnecting".

## Phase 6 — Moderation
- `/admin/reports`, `/admin/reports/:id` and `/admin/appeals` are guarded by `RequireRole('moderator')`, which only shapes the UX; RLS does the real enforcement. `/admin/users` is admin-only.
- The queue has filters (status, number, category, date) and **updates live** as reports arrive or other moderators decide.
- The review page shows:
  - the report and its evidence through signed URLs
  - the audit trail
  - appeals
  - other reports for the same number
  - the decision panel (a reason is required where needed; publishing requires a redacted summary)
- Appeals are resolved in their own tab, which **updates live**.
- The first admin is created by hand with SQL (by email). After that, roles are managed in the app.
- **Admin tools** (`/admin/users`, `/admin/numbers`; SQL functions in `…06_accounts.sql`, each admin-only and audited):
  - `admin_list_users`: search by email.
  - `set_user_role`: change a user's role.
  - `admin_set_password`: sets a bcrypt hash, the same format Supabase Auth uses.
  - `admin_delete_user`: an admin can't delete themselves. The user's reports and evidence are **kept, unlinked**: `reports.reporter_id` is set to null, and nobody can appeal an orphaned report.
  - `admin_list_numbers` and `admin_delete_number`: deleting a number removes all its reports. The function returns the evidence paths, and the client deletes those files through the Storage API under an admin-only delete policy.

## Phase 7 — Testing (no Docker)
- **Unit and component (Vitest + RTL):**
  - phone normalization, Zod schemas, status helpers and moderation rules
  - every search state, form validation and upload limits
  - the realtime hook, with a mocked channel
- **Database (`npm run db:test`):** `scripts/db-test.mjs` loads `supabase/tests/supabase-stub.sql` into PGlite, then all migrations, then each `supabase/tests/database/*.test.sql` file. The stub covers Supabase's `auth`, `storage`, roles, the realtime publication and a small pgTAP subset. Coverage:
  - the access-control matrix
  - the report lifecycle, appeals, rate limits and duplicates
  - storage policies
  - realtime table sync and RLS
  - the admin tools, and keeping reports when a user is deleted
- **Playwright smoke tests:** accessibility (axe) on public pages, mobile overflow and invalid-number handling. They need only the dev server.
- **Manual realtime check** against the hosted project, with two browser windows:
  - approving or removing a report updates search and the home feed live
  - a reporter's My reports changes status live
  - a new submission appears live in the moderator queue

## Phase 8 — Deploy
- **Supabase** (free tier):
  - `db push`, then check the `evidence` bucket is private.
  - Keep **Confirm email** on, set the Site URL and Redirect URLs to the production domain, and configure **custom SMTP**.
- **Cloudflare Pages:** build command `npm run build`, output `dist`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `public/_redirects` provides the SPA fallback.
- **Smoke test** with only the anon key: `reports` is unreadable, while `public_reports` and search work.
- **Cutover:** delete `legacy/`, shut down Firebase project `fraud-detector-app-18d4c`, and rotate or restrict its key.
- **Optional:** `supabase/sample-data.sql`, run by hand, adds demo approved reports.

## Acceptance checklist mapping (spec §11)
| Item | Covered by |
|---|---|
| BD numbers normalize, including Bangla digits | `phone.ts` and its tests, DB CHECK |
| Invalid numbers rejected clearly | search and form errors, `submit_report` check |
| Public search only shows approved, redacted reports | `search_number`, `public_reports`, DB tests 02 and 04 |
| New reports private and pending | `submit_report`, RLS, DB tests 01 and 02 |
| No cross-user reads | RLS on reports, evidence, storage and `report_updates`; DB tests 01, 03, 04 |
| No self-granted roles | no write policies on `user_roles`, admin-only RPC |
| Accounts and admin tools | `…06_accounts.sql`, DB test 05, sign-in and sign-up page tests |
| Auditable moderation | `moderation_actions`, status-history trigger, `audit_logs` |
| Upload type and size limits | Zod, bucket limits, table CHECK, 3-file trigger |
| No secrets shipped | anon key only, `.env.example`, gitleaks in CI |
| Mobile and desktop | responsive layout, Playwright mobile project |
| Policies published | `/privacy`, `/terms`, `/safety` |
| Realtime | `…05_realtime.sql`, `useRealtimeInvalidate`, DB test 04, manual check |

## Open decisions (defaults chosen)
- Mobile numbers only (`+8801[3-9]…`).
- Rate limit of 5 reports per day and a 30-day duplicate window, both tunable in `submit_report`.
- No CAPTCHA at first. Cloudflare Turnstile (free) can be added if abuse appears.
