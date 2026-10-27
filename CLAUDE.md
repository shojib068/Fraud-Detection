# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

ShieldNum is a moderated lookup and reporting site for Bangladeshi (+880) mobile numbers. Signed-in users submit reports; reports stay private until a moderator approves them with a redacted public summary. The product spec is `docs/SPEC.md`; the implementation plan is `.claude/specs/implementation.md`.

Stack: React 19 + TypeScript + Vite, Tailwind CSS v4 (`@tailwindcss/vite`, custom utilities in `src/index.css`), React Router (`react-router`), TanStack Query, React Hook Form + Zod v4, libphonenumber-js, Supabase (Postgres, Auth, Storage). Hosted on Cloudflare Pages.

`legacy/index.html` is the previous single-file Firebase app, kept only until cutover. Don't extend it.

## Commands

- `npm run dev`: dev server at http://127.0.0.1:5173. Needs `.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `npm run lint`, `npm run typecheck`, `npm run build`
- `npm test`: Vitest unit and component tests. Run one file with `npx vitest run src/lib/phone.test.ts`.
- `npx supabase start` then `npx supabase db reset`: local Supabase in Docker, which applies the migrations and `supabase/seed.sql`.
- `npm run db:test`: pgTAP tests in `supabase/tests/database/` (`supabase test db`).
- `npm run test:e2e`: Playwright against local Supabase. Run `db reset` first, because the seeded user is rate-limited. Sign-in codes are read from Mailpit (port 54324).

## Architecture

- **Security lives in the database.** The browser holds only the anon key. RLS is on for every table, and table grants are revoked from `anon`/`authenticated` and re-granted narrowly in `*_rls.sql`.
  - Anonymous visitors read data only through `search_number()` and `get_public_report()`.
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
- **Wording:** never call a number "safe" or "fraudulent". Use "community reports" and "reviewed reports". When nothing is approved, show "No reviewed reports found".

## Changing the database

Add a new timestamped file in `supabase/migrations/` instead of editing applied migrations. With every schema change:

- Update the grants and policies, and update the function grants at the bottom of `*_functions.sql` (a migration revokes all function execute privileges first).
- Update `src/types/database.ts`.
- Add pgTAP tests.
