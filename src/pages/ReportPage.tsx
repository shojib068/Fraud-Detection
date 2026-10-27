import { ReportForm } from '../features/reports/ReportForm';

export function ReportPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Report a suspicious number</h1>
        <p className="mt-2 text-slate-700">
          Reports are reviewed by moderators before anything is published. Only a short, redacted
          summary is ever shown publicly.
        </p>
      </div>
      <div className="card">
        <ReportForm />
      </div>
    </div>
  );
}
