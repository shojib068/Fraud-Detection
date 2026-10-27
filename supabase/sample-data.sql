-- OPTIONAL demo data. Run by hand in the Supabase SQL editor after you have
-- signed in at least once. Adds approved sample reports, attributed to the
-- oldest account, so search and the home page feed have something to show.
-- Delete them later with:
--   delete from public.reports where description like '[sample]%';

with reporter as (
  select id from auth.users order by created_at limit 1
), numbers as (
  insert into public.phone_numbers (normalized_e164)
  values ('+8801712345678'), ('+8801898765432')
  on conflict (normalized_e164) do update set normalized_e164 = excluded.normalized_e164
  returning id, normalized_e164
)
insert into public.reports (
  phone_number_id, reporter_id, category_id, incident_date, description,
  status, public_summary, reviewed_at, created_at
)
select n.id, (select id from reporter), c.id, current_date - v.days_ago,
       '[sample] ' || v.summary, 'approved', v.summary, now(),
       now() - make_interval(days => v.days_ago)
from (values
  ('+8801712345678', 'Mobile Banking & bKash / Nagad OTP Scam', 3,
   'Caller claimed to be a mobile banking agent and asked for a one-time PIN.'),
  ('+8801712345678', 'Banking & Phishing Scam', 10,
   'Caller said a bank account would be blocked and asked for card details.'),
  ('+8801898765432', 'Lottery & Fake Prize (IMO/WhatsApp)', 5,
   'Message announced a prize and asked for a delivery fee in advance.')
) as v (number, category, days_ago, summary)
join numbers n on n.normalized_e164 = v.number
join public.report_categories c on c.name = v.category
-- Safe to re-run: skipped if the samples already exist.
where not exists (select 1 from public.reports where description like '[sample]%');
