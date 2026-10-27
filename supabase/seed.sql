-- LOCAL DEVELOPMENT ONLY. Applied by `supabase db reset`, never by `db push`.
-- Creates three confirmed accounts (sign in with the emailed code; read it
-- in Mailpit at http://127.0.0.1:54324) and a few approved sample reports.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt(gen_random_uuid()::text, extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
from (values
  ('a0000000-0000-0000-0000-000000000001'::uuid, 'user@shieldnum.test'),
  ('a0000000-0000-0000-0000-000000000002'::uuid, 'moderator@shieldnum.test'),
  ('a0000000-0000-0000-0000-000000000003'::uuid, 'admin@shieldnum.test')
) as u (id, email);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@shieldnum.test';

insert into public.user_roles (user_id, role) values
  ('a0000000-0000-0000-0000-000000000002', 'moderator'),
  ('a0000000-0000-0000-0000-000000000003', 'admin');

-- Sample approved reports, so search has something to show.
insert into public.phone_numbers (id, normalized_e164) values
  ('b0000000-0000-0000-0000-000000000001', '+8801712345678'),
  ('b0000000-0000-0000-0000-000000000002', '+8801898765432');

insert into public.reports (
  phone_number_id, reporter_id, category_id, incident_date, description,
  status, public_summary, reviewed_at, created_at
)
-- created_at is backdated so these rows do not count toward the seeded user's daily limit.
select v.phone_id, 'a0000000-0000-0000-0000-000000000001', c.id, current_date - v.days_ago,
       v.description, 'approved', v.summary, now(), now() - make_interval(days => v.days_ago)
from (values
  ('b0000000-0000-0000-0000-000000000001'::uuid, 'Mobile Banking & bKash / Nagad OTP Scam', 3,
   'Caller claimed to be a bKash agent and asked for the OTP sent to my phone.',
   'Caller claimed to be a mobile banking agent and asked for a one-time PIN.'),
  ('b0000000-0000-0000-0000-000000000001'::uuid, 'Banking & Phishing Scam', 10,
   'Said my bank account would be blocked unless I shared my card number.',
   'Caller said a bank account would be blocked and asked for card details.'),
  ('b0000000-0000-0000-0000-000000000002'::uuid, 'Lottery & Fake Prize (IMO/WhatsApp)', 5,
   'WhatsApp message said I won a prize and had to pay a delivery fee first.',
   'Message announced a prize and asked for a delivery fee in advance.')
) as v (phone_id, category, days_ago, description, summary)
join public.report_categories c on c.name = v.category;
