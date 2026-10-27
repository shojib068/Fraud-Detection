# ShieldNum

Look up community reports about Bangladeshi (+880) phone numbers and report suspicious calls.
Reports stay private until a moderator reviews and redacts them; the public only ever sees short,
moderator-written summaries. See [docs/SPEC.md](docs/SPEC.md) for the product spec and
[.claude/specs/implementation.md](.claude/specs/implementation.md) for the implementation plan.

**Stack:** React + TypeScript + Vite, Tailwind CSS, React Hook Form + Zod, libphonenumber-js,
TanStack Query, Supabase (Postgres, Auth, Storage, RLS), Cloudflare Pages.

## Local development

Requirements: Node 22+ and Docker (for local Supabase).

```sh
npm install
npx supabase start          # starts Postgres, Auth, Storage and Mailpit in Docker
npx supabase db reset       # applies supabase/migrations and supabase/seed.sql
npx supabase status         # copy "API URL" and "anon key"
cp .env.example .env.local  # paste them into VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
npm run dev                 # http://127.0.0.1:5173
```

Sign-in is by emailed 6-digit code. Locally, emails land in Mailpit at http://127.0.0.1:54324.
The seed creates three accounts:

| Email | Role |
|---|---|
| `user@shieldnum.test` | user |
| `moderator@shieldnum.test` | moderator |
| `admin@shieldnum.test` | admin |

Search `01712-345678` to see seeded reviewed reports.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit and component tests (Vitest + Testing Library) |
| `npm run db:test` | pgTAP access-control and workflow tests (`supabase test db`, needs local Supabase) |
| `npm run test:e2e` | Playwright against local Supabase. Run `npx supabase db reset` first: the seeded user has a 5-reports-per-day limit. |

## Project layout

```
src/
  components/    shared UI (Layout, Alert, StatusBadge, FormField, Spinner)
  features/      auth, search, reports, moderation
  lib/           phone normalization, status labels, formatting
  pages/         route components (pages/admin for staff)
  services/      Supabase client and data access
  types/         shapes returned by SQL functions
supabase/
  migrations/    schema, RLS, functions, storage (applied in order)
  tests/         pgTAP tests
  seed.sql       local-only users and sample reports
  templates/     sign-in code email templates
tests/e2e/       Playwright specs
legacy/          the previous single-file Firebase app (remove at cutover)
```

## Security model

- The browser only has the Supabase **anon** key. Never put the service-role key in a `VITE_`
  variable, in this repo, or in Cloudflare Pages build settings.
- RLS is enabled on every table. Anonymous visitors can only call `search_number()` and
  `get_public_report()`, which return approved, redacted summaries.
- Reporters read their own reports through `my_reports()`; they cannot read the `reports` table.
- All writes (`submit_report`, `moderate_report`, `submit_appeal`, `resolve_appeal`,
  `set_user_role`) are `SECURITY DEFINER` SQL functions that check the caller's role and record
  audit entries.
- Evidence lives in the private `evidence` bucket (5 MB, JPEG/PNG/WebP, max 3 per report) and is
  viewed by moderators through 60-second signed URLs.

## Deployment

1. **Supabase** (free tier): create a project, then
   `npx supabase link --project-ref <ref>` and `npx supabase db push`.
   - Auth → Email: enable sign-ups, set the OTP length to 6, and paste the templates from
     `supabase/templates/` into "Magic Link" and "Confirm signup".
   - Auth → URL configuration: set the site URL to your Cloudflare Pages domain.
   - Auth → Rate limits: keep the defaults or tighten them.
   - Storage: confirm the `evidence` bucket is **private**.
2. **First admin:** sign in once on the live site, then in the SQL editor run
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'you@example.com';
   ```
   Further roles are managed from **Users** in the app.
3. **Cloudflare Pages:** connect the GitHub repo. Build command `npm run build`, output `dist`.
   Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `public/_redirects` provides the SPA
   fallback.
4. **Smoke test** with only the anon key: search works, and `select * from reports` through the
   REST API returns a permission error.

Free-tier limits and provider terms change; check them before launch. The privacy and terms pages
are drafts and need legal review before public launch.

## Legacy app and cutover

`legacy/index.html` is the previous Firebase app, kept runnable until cutover. Its Firestore data
is not migrated: those reports were never moderated and stored screenshots inline. At cutover,
delete `legacy/`, shut down the Firebase project `fraud-detector-app-18d4c`, and rotate or
restrict its API key, which is hardcoded in that file.
