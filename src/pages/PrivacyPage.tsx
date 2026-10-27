import { Alert } from '../components/Alert';

export function PrivacyPage() {
  return (
    <article className="prose-page mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Privacy notice</h1>
      <div className="mt-4">
        <Alert tone="warning">
          Draft. This notice must be reviewed by a legal professional before public launch.
        </Alert>
      </div>

      <h2>What we collect</h2>
      <ul>
        <li>Your email address, used only to sign you in and link you to your reports.</li>
        <li>
          Reports you submit: the phone number, category, incident date, description and any
          screenshots.
        </li>
        <li>Moderation records: decisions, reasons and timestamps, kept for accountability.</li>
      </ul>

      <h2>Who can see it</h2>
      <ul>
        <li>
          The public sees only moderator-written, redacted summaries of approved reports, never your
          identity.
        </li>
        <li>
          Your full report and screenshots are visible to you and to authorized moderators only.
        </li>
        <li>Screenshots are stored in a private bucket and opened through short-lived links.</li>
      </ul>

      <h2>Retention</h2>
      <p>
        Unpublished reports and their evidence are kept for up to 12 months after a decision, then
        deleted. Published summaries remain until they are corrected or removed. Audit records of
        moderation decisions are kept for up to 24 months.
      </p>

      <h2>Your choices</h2>
      <p>
        You can ask for your account and reports to be deleted, or request a correction or removal
        of any published report from its public page. See the terms page for details.
      </p>

      <h2>Service providers</h2>
      <p>
        Data is stored with Supabase (database, authentication and file storage) and the site is
        served by Cloudflare Pages. We do not sell data or use it for advertising.
      </p>
    </article>
  );
}
