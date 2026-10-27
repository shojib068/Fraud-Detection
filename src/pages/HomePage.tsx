import { Link } from 'react-router';
import { SearchForm } from '../features/search/SearchForm';

const TIPS = [
  'Banks, bKash and Nagad never ask for your OTP or PIN over the phone.',
  'Hang up and call back on the official number printed on your card or app.',
  'Be wary of prizes, jobs or investments that need an upfront fee.',
  'Do not install apps or share your screen at a caller’s request.',
];

export function HomePage() {
  return (
    <div className="space-y-10">
      <section className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Check a phone number before you trust it
        </h1>
        <p className="mt-3 text-slate-700">
          Search moderator-reviewed community reports about Bangladeshi phone numbers, or report a
          suspicious call.
        </p>
        <div className="card mt-6 text-left">
          <SearchForm />
        </div>
      </section>

      <section aria-labelledby="tips-heading" className="grid gap-6 md:grid-cols-2">
        <div className="card">
          <h2 id="tips-heading" className="text-lg font-semibold">
            Quick safety tips
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700">
            {TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <Link
            to="/safety"
            className="mt-4 inline-block text-sm font-medium text-blue-800 underline"
          >
            More safety advice
          </Link>
        </div>
        <div className="card">
          <h2 className="text-lg font-semibold">How reports work</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Signed-in users submit a report with optional screenshots.</li>
            <li>Reports stay private until a moderator reviews them.</li>
            <li>Moderators remove personal information and publish a short summary.</li>
            <li>Anyone can request a correction or removal of a published report.</li>
          </ol>
          <Link to="/report" className="btn-primary mt-4">
            Report a number
          </Link>
        </div>
      </section>
    </div>
  );
}
