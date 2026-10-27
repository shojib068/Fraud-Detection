# ShieldNum

Look up community reports about Bangladeshi (+880) phone numbers and report suspicious calls.
Reports stay private until a moderator reviews and redacts them; the public only ever sees short,
moderator-written summaries. See [docs/SPEC.md](docs/SPEC.md) for the product spec and
[.claude/specs/implementation.md](.claude/specs/implementation.md) for the implementation plan.

**Stack:** React + TypeScript + Vite, Tailwind CSS, React Hook Form + Zod, libphonenumber-js,
TanStack Query, Supabase (Postgres, Auth, Storage, RLS), Cloudflare Pages.

## Getting started (no Docker)

You need Node 22+ and a free Supabase account. The database, sign-in, file storage and realtime
all run in your hosted Supabase project.

1. **Create a project** at https://supabase.com/dashboard and note its project ref (the
   `xxxx` in `https://xxxx.supabase.co`).
2. **Install and apply the database:**
   ```sh
   npm install
   npx supabase login
   npx supabase link --project-ref <your-project-ref>   # asks for the database password
   npx supabase db push                                  # applies supabase/migrations
   ```
   No Docker is needed for these commands. Alternatively, paste each file in
   `supabase/migrations/` into the dashboard's SQL editor, in filename order.
3. **Configure sign-in** in the dashboard:
   - Authentication → Sign In / Providers → **Email**: keep it enabled and make sure
     **Confirm email** is **on**, then save.
   - Authentication → URL Configuration: set the Site URL to `http://localhost:5173`, and under
     Redirect URLs add `http://localhost:5173/**`. The verification link in the email returns
     here.
4. **Connect the app:** copy `.env.example` to `.env.local` and paste the Project URL and the
   anon (publishable) key from Project Settings → API.
5. **Run it:** `npm run dev`, open http://localhost:5173, click **Sign up**, then click the
   verification link in the email. You come back signed in.
6. **Make yourself admin:** run this in the SQL editor with your email:
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'you@example.com';
   ```
   Refresh the page. The **Moderation** and **Users** menus appear.
7. **Optional demo data:** run `supabase/sample-data.sql` in the SQL editor, then search
   `01712-345678`.

## Accounts

- Anyone can **sign up** with an email and password (8+ characters). No admin approval is needed.
- Supabase emails a **verification link**. After clicking it, the user signs in with their email
  and password. Signing in before verifying shows a "Verify your email first" message with a
  **Resend** button.
- Users change their password under **Account**. If someone forgets theirs, an admin sets a new
  one under **Users → Reset password**.
- **Admins** can also:
  - change roles (user, moderator, admin)
  - **delete a user**: the account is removed; their reports stay, without their name
  - **delete a number** under **Numbers**: the number, all its reports and their evidence images
    are removed permanently

> **Sending email to other people.** Supabase's built-in email only reaches members of your
> project team, about 2 emails per hour. That's enough to test with your own address. Before
> others sign up, set up custom SMTP under Authentication → Emails → **SMTP Settings**. For
> example, with [Resend](https://resend.com) (free tier: 3,000 emails a month):
> verify your domain in Resend, create an API key, then enter host `smtp.resend.com`, port `465`,
> username `resend`, the API key as password, and a sender like `no-reply@yourdomain.com`.
> Then raise the email rate limit under Authentication → Rate Limits.

## Realtime

Pages update without a refresh when the data changes:

| Page | Updates when |
|---|---|
| Home (recent reports feed), search, public report page | a moderator publishes, redacts or removes a report |
| My reports | a moderator acts on one of your reports |
| Moderation queue, review page, appeals | a report is submitted, decided or appealed |

A "Live" dot shows that the page is connected. Realtime only delivers rows the user is allowed
to read: anonymous visitors subscribe to `public_reports` (approved, redacted fields only),
reporters to `report_updates` (their own statuses only), and moderators to `reports` and
`appeals`. Changes trigger a refetch through the normal functions, so the same privacy rules
apply. See `supabase/migrations/*_realtime.sql`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server at http://localhost:5173 |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |
| `npm test` | Unit and component tests (Vitest + Testing Library) |
| `npm run db:test` | Runs every migration and the SQL tests in `supabase/tests/database/` inside PGlite (Postgres in WebAssembly). No Docker, no network. |
| `npm run test:e2e` | Playwright smoke tests (accessibility, mobile layout, input validation) against the dev server |

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
  migrations/    schema, RLS, functions, storage, realtime (applied in order)
  tests/         SQL tests + supabase-stub.sql for the PGlite runner
  sample-data.sql optional demo reports (run by hand)
scripts/         db-test.mjs (PGlite test runner)
tests/e2e/       Playwright smoke tests
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

1. **Supabase:** the project from "Getting started" can be the production project, or create a
   separate one and `link` + `db push` to it. Check that the `evidence` bucket is **private**,
   that **Confirm email** is on, and that custom SMTP is set up.
2. **Cloudflare Pages:** connect the GitHub repo. Build command `npm run build`, output `dist`.
   Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `public/_redirects` provides the SPA
   fallback.
3. **Smoke test** with only the anon key: search and the recent feed work, and reading
   `reports` through the REST API returns a permission error.

Free-tier limits and provider terms change; check them before launch. The privacy and terms pages
are drafts and need legal review before public launch.

## Legacy app and cutover

`legacy/index.html` is the previous Firebase app, kept runnable until cutover. Its Firestore data
is not migrated: those reports were never moderated and stored screenshots inline. At cutover,
delete `legacy/`, shut down the Firebase project `fraud-detector-app-18d4c`, and rotate or
restrict its API key, which is hardcoded in that file.
