# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

ShieldNum is a moderated lookup and reporting site for Bangladeshi (+880) mobile numbers. Signed-in users submit reports; reports stay private until a moderator approves them with a redacted public summary. The product spec is `docs/SPEC.md`; the implementation plan is `.claude/specs/implementation.md`.

Stack: React 19 + TypeScript + Vite, Tailwind CSS v4 (`@tailwindcss/vite`, custom utilities in `src/index.css`), React Router (`react-router`), TanStack Query, React Hook Form + Zod v4, libphonenumber-js, Supabase (Postgres, Auth, Storage, Realtime), hosted, with no Docker. The app is hosted on Cloudflare Pages.

`legacy/index.html` is the previous single-file Firebase app, kept only until cutover. Don't extend it.

## Commands

There's no Docker. The database is a hosted Supabase project.

- `npm run dev`: dev server at http://localhost:5173. Needs `.env.local` with the hosted project's `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `npm run lint`, `npm run typecheck`, `npm run build`
- `npm test`: Vitest unit and component tests. Run one file with `npx vitest run src/lib/phone.test.ts`.
- `npm run db:test`: `scripts/db-test.mjs` loads `supabase/tests/supabase-stub.sql` into PGlite, then every migration, then each `supabase/tests/database/*.test.sql`. The stub covers the auth and storage schemas, roles, the realtime publication and a small pgTAP subset (plan, ok, is, throws_ok, lives_ok). Filter by file with `npm run db:test -- 04_`.
- `npm run test:e2e`: Playwright smoke tests (axe, mobile overflow, validation). Needs only the dev server.
- `npx supabase db push`: applies new migrations to the linked hosted project. Run `npx supabase link --project-ref <ref>` once first. `supabase/seed.sql` doesn't exist; `supabase/sample-data.sql` is optional and run by hand.

## Architecture

- **Security lives in the database.** The browser holds only the anon key. RLS is on for every table, and table grants are revoked from `anon`/`authenticated` and re-granted narrowly in `*_rls.sql`.
  - Anonymous visitors read data only through `search_number()`, `get_public_report()` and the `public_reports` table (approved, redacted fields only).
  - Reporters can't select `reports`. They use `my_reports()`, which leaves out `moderator_note`.
  - Every write goes through a `SECURITY DEFINER` function in `*_functions.sql`. Those functions validate input, check the caller's role, and write `moderation_actions` and `audit_logs`.
- **Helper functions** live in the non-exposed `private` schema with `set search_path = ''`. Any helper that an RLS policy calls must be granted to every role that hits that policy. For example, `is_moderator()` is granted to `anon` because the categories policy uses it.
- **Status changes** are recorded automatically by a trigger on `reports`, which writes `report_status_history`. Allowed transitions are defined in `moderate_report()` and mirrored in `src/features/moderation/actions.ts`. Keep the two in sync.
- **Numbers** are stored as E.164 (`+8801[3-9]XXXXXXXX`), and a CHECK on `phone_numbers` enforces this. Client normalization is in `src/lib/phone.ts` (Bangla digits, separators, `01…`/`880…`/`00880…`). The server revalidates the same regex. Only mobile numbers are accepted.
- **Evidence** goes in the private `evidence` bucket at `{uid}/{report_id}/{uuid}.{ext}`. Storage policies (`*_storage.sql`) and the `report_evidence` policy and trigger re-check ownership, type, the 5 MB size limit and the 3-file limit. Moderators view evidence through 60-second signed URLs.
- **Frontend layout:**
  - `src/services/` wraps Supabase calls and converts errors with `unwrap()`/`toServiceError()`.
  - `src/types/database.ts` hand-maintains the shapes the SQL functions return.
  - `src/features/*` holds feature components, and `src/pages/*` holds route components. Staff and signed-in pages are lazy-loaded in `src/App.tsx`.
  - Route guards (`RequireAuth`, `RequireRole`) only shape the UX; RLS does the actual enforcement.
- **Realtime:** `postgres_changes` only delivers rows the subscriber can `select`.
  - Anonymous visitors subscribe to `public_reports`; reporters to `report_updates`; moderators to `reports` and `appeals`.
  - `private.sync_realtime_tables()` keeps `public_reports` and `report_updates` in sync from `reports`. It lives in `*_realtime.sql`.
  - The client hook `useRealtimeInvalidate` (`src/lib/useRealtime.ts`) only refetches query keys and never renders payloads, so reads still go through the RPCs.
  - `src/test/setup.ts` mocks the hook in every test except its own.
- **Accounts:** email + password with Supabase email verification (Confirm email on). Sign-up is open.
  - `src/pages/SignUpPage.tsx` sends users back to `/login` from the verification link. `src/pages/LoginPage.tsx` handles unverified emails with a resend button.
  - Admin tools live in `*_accounts.sql`: delete user, set password, list and delete numbers.
  - Deleting a user keeps their reports, with `reporter_id` set to null. Code must handle a null `reporter_id`, and comparisons on it must be null-safe.
  - `profiles.username` exists from an earlier revision but is unused.
- **Wording:** never call a number "safe" or "fraudulent". Use "community reports" and "reviewed reports". When nothing is approved, show "No reviewed reports found".

## Changing the database

Add a new timestamped file in `supabase/migrations/` instead of editing applied migrations. With every schema change:

- Update the grants and policies, and update the function grants at the bottom of `*_functions.sql` (a migration revokes all function execute privileges first).
- Update `src/types/database.ts`.
- Add SQL tests and run `npm run db:test`. Anything the migrations need from Supabase must exist in `supabase/tests/supabase-stub.sql`.
- If you add a column that must reach the public, also update `public_reports` and its sync trigger.
