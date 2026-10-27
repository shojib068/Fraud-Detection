import { Link } from 'react-router';
import { Alert } from '../components/Alert';

export function TermsPage() {
  return (
    <article className="prose-page mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Terms, acceptable use and removal requests</h1>
      <div className="mt-4">
        <Alert tone="warning">
          Draft. These terms must be reviewed by a legal professional before public launch.
        </Alert>
      </div>

      <h2>Disclaimer</h2>
      <p>
        ShieldNum publishes community reports after moderator review. Reports are unverified claims
        from individuals and are not a finding that any person committed fraud. ShieldNum never
        labels a number as “safe” or “fraudulent”. Numbers can be spoofed, shared or reassigned.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Report only calls or messages you experienced, honestly and accurately.</li>
        <li>
          Do not include names, addresses, national ID numbers, account numbers or private
          conversations.
        </li>
        <li>Do not use ShieldNum to harass, threaten or settle personal disputes.</li>
        <li>Do not submit automated, bulk or duplicate reports.</li>
      </ul>
      <p>We may remove reports and suspend accounts that break these rules.</p>

      <h2>Moderation</h2>
      <p>
        Moderators may approve, reject, request more information, redact or remove reports. Each
        decision is recorded with a reason and timestamp.
      </p>

      <h2>Correction and removal requests</h2>
      <p>
        If a published report concerns your number, contains an error or includes personal
        information, open the report’s public page and choose “Request correction or removal”. You
        need to sign in so we can reply. Moderators review every request.
      </p>

      <h2>Appeals</h2>
      <p>
        If your report was rejected or removed, you can appeal once per decision from{' '}
        <Link to="/my-reports" className="underline">
          My reports
        </Link>
        . A moderator will review the appeal and record the outcome.
      </p>

      <h2>Errors and contact</h2>
      <p>
        To report a problem with the site or request account deletion, use a correction request on
        any affected report, or contact the operators through the address published on this page at
        launch.
      </p>
    </article>
  );
}
