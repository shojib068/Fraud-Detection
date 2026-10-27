ShieldNum — Project Specification
Version: 1.1
Purpose: A free-to-start website for looking up and reporting potentially fraudulent Bangladeshi phone numbers.
1. Product overview
ShieldNum helps people check community-reported phone numbers and submit suspicious-call or scam reports.
MVP goals
- Search Bangladesh phone numbers (+880) and view moderated, public-safe summaries.
- Let users submit reports with a category, incident date, description, and optional evidence.
- Only signed-in users track their submissions, and submit the fraud numbers.
- Let moderators review, approve, reject, redact, and handle appeals.
- Protect private information and prevent spam or abuse.
Out of scope for MVP
- Automatic accusations or AI-based fraud verdicts.
- Public display of submitters' identities, private evidence, or unreviewed reports.
- Paid APIs, paid AI services, or a native mobile app.
2. Recommended stack (target: $0/month)
Area	Technology	Purpose
Website	React + TypeScript + Vite	Responsive frontend
UI	Tailwind CSS	Styling and reusable components
Forms	React Hook Form + Zod	Input handling and validation
Phone parsing	libphonenumber-js	Normalize and validate numbers
Database	Supabase PostgreSQL	Application data
Login	Supabase Auth	Email-based sign-in
Evidence	Supabase Storage, private bucket	Restricted evidence uploads
Server logic	Supabase Edge Functions / SQL functions	Trusted operations and checks
Hosting	Cloudflare Pages Free	Public website hosting
Source control	GitHub	Code, issues, and change history
Tests	Vitest, React Testing Library, Playwright	Unit, component, and browser tests


Cost note: This stack can target $0/month within free-tier quotas, but it is not unlimited or guaranteed to remain free. Review current provider limits before launch. Avoid exposing Supabase service-role keys or other secrets in frontend code.
3. Main pages
- / — Home page with search and safety guidance.
- /search?q= — Search results for a normalized phone number.
- /report — Report submission form; login required.
- /my-reports — Signed-in user's reports and statuses.
- /report/:id — Public-safe report summary, if approved.
- /safety — Advice for responding to suspicious calls.
- /privacy and /terms — Privacy notice, acceptable-use rules, and disclaimers.
- /admin/reports — Moderator queue; authorized staff only.
4. Core user flows
Search
1. User enters a number in Bangla or English digits.
2. Normalize digits and validate the Bangladesh number.
3. Query only a safe public summary, never raw private report data.
4. Show approved report count, categories, dates, moderation status, and safety advice.
5. If there are no reviewed reports, say “No reviewed reports found”, not “safe number.”
Submit a report
1. User signs in and enters the phone number, category, incident date, description, and optional evidence.
2. Validate inputs, apply rate limits, and store the report as pending.
3. Keep evidence private and restrict access.
4. Show a submission reference and status in /my-reports.
5. Publish only after moderator review and redaction.
Moderation
1. Moderator reviews the report and evidence.
2. Moderator may approve, reject, request clarification, redact sensitive data, or escalate.
3. Record the action, moderator, timestamp, and reason in an audit trail.
4. Allow a reporter to appeal through a controlled process.
5. Data model
Use UUID primary keys, timestamps, foreign keys, and indexes where appropriate.
- profiles — id (auth user ID), display_name, created_at.
- user_roles — user_id, role (user, moderator, admin). Role changes must be restricted to trusted administrators.
- phone_numbers — id, normalized_e164 (unique), country_code, created_at.
- report_categories — id, name, description, is_active.
- reports — id, phone_number_id, reporter_id, category_id, incident_date, description, status, moderator_note (private), created_at, updated_at, reviewed_at.
- report_evidence — id, report_id, storage_path, mime_type, file_size, uploaded_at. Store only private object paths, never public evidence URLs.
- moderation_actions — id, report_id, moderator_id, action, reason, created_at.
- report_status_history — id, report_id, old_status, new_status, changed_by, created_at.
- appeals — id, report_id, requester_id, reason, status, created_at, resolved_at.
- audit_logs — id, actor_id, event_type, target_type, target_id, created_at. Do not log passwords, tokens, or unnecessary sensitive content.
Suggested report states: pending, needs_info, approved, rejected, appealed, removed.
6. Privacy and security requirements
- Enable Row Level Security (RLS) on every exposed table.
- Public visitors can read only a curated view or function containing approved, redacted summaries.
- Never allow anonymous users to select raw reports, reporter identities, moderator notes, evidence paths, or audit logs.
- Users can create and view their own reports; they cannot approve reports or assign roles to themselves.
- Moderators can access the review queue and private evidence only through authorized policies.
- Keep the evidence bucket private; use short-lived signed URLs only when access is authorized.
- Validate all inputs on the server as well as in the browser.
- Add request throttling, duplicate-report checks, upload size/type limits, and CAPTCHA only if needed and available within budget.
- Never expose service-role keys in GitHub, browser code, screenshots, or logs.
- Provide a way to report errors, request correction/removal, and appeal moderation decisions.
- Publish clear privacy, retention, acceptable-use, and disclaimer policies. Get appropriate legal review before public launch.
7. Phone-number handling
- Convert Bangla numerals (০১২৩...) to English digits.
- Trim spaces, hyphens, and brackets; parse with libphonenumber-js.
- Validate as a Bangladesh number and store in E.164 format, such as +8801XXXXXXXXX.
- Do not treat a number as fraudulent solely because multiple reports exist.
- Do not display a “safe” or “fraudulent” verdict based only on raw report count. Show reviewed evidence and moderation status with context.
8. UX and accessibility
- Mobile-first responsive layout; support phone and desktop screens.
- Clear states: loading, no results, invalid number, network error, pending review, and successful submission.
- Use neutral wording such as “community reports” and “reviewed reports.”
- Never expose personal addresses, national IDs, account details, private messages, or unrelated personal information.
- Use keyboard-accessible forms, visible focus states, labels, and readable contrast.
- Do not publish screenshots or attachments without reviewing and redacting personal information.
9. Repository structure
shieldnum/
├── docs/
│   └── SPEC.md
├── public/
├── src/
│   ├── components/
│   ├── pages/
│   ├── features/
│   │   ├── search/
│   │   ├── reports/
│   │   └── moderation/
│   ├── lib/
│   ├── services/
│   ├── types/
│   └── main.tsx
├── supabase/
│   ├── migrations/
│   └── functions/
├── tests/
├── .env.example
├── package.json
└── README.md
Commit database schema and RLS policies as migrations. Keep real secrets in local environment variables or provider settings, not in the repository. .env.example should contain placeholder values only.
10. Build plan
1. Foundation: Create GitHub repo, Vite React TypeScript app, formatting, linting, and environment setup.
2. Database/security: Create Supabase tables, constraints, indexes, RLS policies, and private evidence storage.
3. Search: Implement number normalization and safe public search.
4. Reports: Add authentication, submission form, validation, private evidence upload, and report history.
5. Moderation: Build protected review queue, decisions, audit trail, and appeals.
6. Testing: Test normalization, access controls, report status transitions, abuse cases, and responsive UI.
7. Deploy: Connect GitHub to Cloudflare Pages, configure environment variables, run migrations, and test production policies.
11. Minimum acceptance checklist
- [ ] Valid Bangladesh numbers normalize consistently, including Bangla digits.
- [ ] Invalid numbers are rejected with a clear message.
- [ ] Public search returns only approved and redacted summaries.
- [ ] New reports remain private and pending until reviewed.
- [ ] Users cannot read another user's private reports or evidence.
- [ ] Users cannot grant themselves moderator/admin roles.
- [ ] Moderator actions and status changes are auditable.
- [ ] Uploads enforce file type and size restrictions.
- [ ] No secrets are committed or shipped to the browser.
- [ ] Core flows work on mobile and desktop.
- [ ] Privacy, terms, correction/removal, and appeal instructions are published.
Recommended starting point: GitHub + Cloudflare Pages Free + Supabase Free. Build and test access-control policies before publishing the reporting feature. Free-tier quotas and provider terms can change; verify them before launch.