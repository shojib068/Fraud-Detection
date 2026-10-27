export function SafetyPage() {
  return (
    <article className="prose-page mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold">Staying safe from phone scams</h1>
      <p className="mt-3">
        Most phone scams in Bangladesh try to get an OTP, PIN or a quick payment. These steps help
        whether or not a number has community reports.
      </p>

      <h2>Never share these over the phone</h2>
      <ul>
        <li>One-time passwords (OTPs) sent by SMS, including for bKash, Nagad, Rocket or banks.</li>
        <li>Mobile wallet or ATM PINs, card numbers, CVV codes or internet banking passwords.</li>
        <li>
          Photos of your national ID card unless you started the process on an official channel.
        </li>
      </ul>

      <h2>Warning signs</h2>
      <ul>
        <li>Urgency: “your account will be blocked today”, “act now or lose the prize”.</li>
        <li>Fees up front for a prize, job, visa, loan or delivery.</li>
        <li>Requests to install an app, share your screen or “send money by mistake” back.</li>
        <li>Callers claiming to be from a bank, mobile operator, police or a government office.</li>
      </ul>

      <h2>If you get a suspicious call</h2>
      <ol>
        <li>
          Hang up. Call back using the official number on your card, app or the organisation’s
          website.
        </li>
        <li>Do not follow instructions to dial codes or press keys.</li>
        <li>Report the number here so others can see reviewed reports.</li>
      </ol>

      <h2>If you already lost money</h2>
      <ol>
        <li>
          Call your mobile financial service or bank immediately, using its official helpline, to
          block the account or transaction.
        </li>
        <li>
          Call 999 for emergencies and file a general diary (GD) at your local police station.
        </li>
        <li>
          Keep screenshots, transaction IDs and call times. You can attach redacted screenshots to a
          report here.
        </li>
      </ol>

      <h2>About ShieldNum results</h2>
      <p>
        “No reviewed reports found” does not mean a number is safe, and published reports are
        community claims, not proof. Numbers can be spoofed or reassigned. Use your judgement.
      </p>
    </article>
  );
}
