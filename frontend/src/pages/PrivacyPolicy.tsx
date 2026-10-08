import LegalPageLayout from '../components/LegalPageLayout';

// Retention periods shown in the policy. Items marked "enforced today" match
// what backend/src/jobs/cleanup.js already deletes; the rest are PROPOSED
// periods that cleanup.js does not enforce yet. Change the text here and make
// cleanup.js enforce the same values (docs/COMPLIANCE_MAPPING.md, item 4.6)
// before relying on them.
const RETENTION: { data: string; kept: string }[] = [
  {
    data: 'Messages sent through the contact form',
    kept: '12 months after the enquiry was last updated',
  },
  {
    data: 'Client accounts and engagement records (compliance checklist status, notes, risk score)',
    kept: '24 months after the account is closed',
  },
  {
    data: 'Sign-in attempts (IP address, browser, result)', // enforced today
    kept: '90 days',
  },
  {
    data: 'Blocked IP addresses', // enforced today
    kept: 'Removed 7 days after the block ends',
  },
  {
    data: 'Active sessions, email verification links and password reset links',
    kept: 'Until they expire (hours to days)',
  },
  {
    data: 'Records of actions taken by our staff on the platform',
    kept: '24 months',
  },
  {
    data: 'Emails waiting in or recently sent through our sending queue',
    kept: 'About 24 hours after sending',
  },
];

const PROVIDERS: { name: string; does: string; receives: string }[] = [
  {
    name: 'Vercel',
    does: 'Hosts this website',
    receives:
      'The IP address and browser details of everyone who visits, and the pages they request',
  },
  {
    name: 'Render',
    does: 'Runs our application server',
    receives:
      'Everything our server handles: form submissions, account and sign-in details, and the technical logs the server produces',
  },
  {
    name: 'Neon',
    does: 'Hosts our database',
    receives:
      'The data we store: contact messages, client accounts, engagement records, and sign-in and security records',
  },
  {
    name: 'Resend',
    does: 'Sends our emails',
    receives:
      'The recipient email address and the content of each email: verification and password reset links, new sign-in alerts to clients, and notifications to us of messages sent through the contact form (which include the sender’s name, email address, company and message)',
  },
  {
    name: 'Sentry',
    does: 'Reports errors so we can fix them',
    receives:
      'Technical details of errors (page or request address, browser type, error messages), which can incidentally include personal data. For signed-in users, also the account ID, email address and role',
  },
  {
    name: 'Discord',
    does: 'Delivers security and error alerts to our team',
    receives:
      'IP addresses and technical descriptions of suspected attacks, blocked connections and server errors',
  },
  {
    name: 'Google Fonts',
    does: 'Supplies the typefaces this website uses',
    receives: 'Your IP address and browser details each time a page loads',
  },
];

const COOKIES: { name: string; purpose: string; lasts: string }[] = [
  {
    name: 'clientToken',
    purpose: 'Keeps you signed in to your client account. Set only when you sign in.',
    lasts: 'About 2 hours',
  },
  {
    name: 'csrfToken',
    purpose:
      'A security token that stops other websites submitting our forms on your behalf. Set when the site communicates with our server.',
    lasts: '24 hours',
  },
  {
    name: 'theme (browser local storage)',
    purpose:
      'Remembers your light or dark display choice. Stays on your device and is never sent to us.',
    lasts: 'Until you clear your browser data',
  },
];

const h2 = 'text-white font-semibold text-xl mt-8 mb-3';
const th = 'border-b border-white/20 py-2 pr-4 text-white font-semibold align-bottom';
const td = 'border-b border-white/10 py-2 pr-4 align-top';
const link = 'text-alux-cyan hover:underline';

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="Privacy Policy" lastUpdated="October 8, 2026">
      <p>
        Alux Plaza (&quot;we&quot;, &quot;us&quot;) is a cybersecurity consultancy based in Nairobi,
        Kenya, and is the data controller for the personal data described in this policy. It
        explains what we collect, why, who receives it, how long we keep it, and the rights you
        have, in line with the Kenya Data Protection Act, 2019 and the Data Protection (General)
        Regulations, 2021.
      </p>

      <h2 className={h2}>What we collect</h2>
      <ul className="list-disc pl-6 space-y-2">
        <li>
          <strong className="text-white">Contact form:</strong> your name, email address, company
          name (optional), your message, and the time you agreed to this policy.
        </li>
        <li>
          <strong className="text-white">Client account:</strong> your company name, email address,
          and your password (stored only as a one-way hash, never in readable form). If you sign up
          yourself, we also record when you agreed to this policy.
        </li>
        <li>
          <strong className="text-white">Engagement records:</strong> if you become a client, the
          compliance checklist status and notes, risk score, and share links we create for you.
        </li>
        <li>
          <strong className="text-white">Sign-in and security records:</strong> the IP address and
          browser details of sign-in attempts, whether they succeeded, and your active sessions, so
          we can protect accounts and alert you to sign-ins from a new device.
        </li>
        <li>
          <strong className="text-white">Technical data when you visit:</strong> like any website,
          our hosting and font providers see your IP address and browser details (see &quot;Who we
          share it with&quot;).
        </li>
      </ul>
      <p>
        We collect this information from you directly, or automatically when you use the site. We do
        not use third-party advertising trackers or analytics, and we do not sell any data we
        collect.
      </p>

      <h2 className={h2}>Why we use it</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>To respond to enquiries submitted through our contact form</li>
        <li>To create and manage client accounts and deliver client engagements</li>
        <li>To send account emails: verification, password reset, and new sign-in alerts</li>
        <li>To keep security logs, detect attacks and block abusive connections</li>
        <li>
          To keep a record of the agreement you gave, and to handle requests under this policy
        </li>
      </ul>

      <h2 className={h2}>Who we share it with</h2>
      <p>
        We use the service providers below to run the site. Each receives only what it needs for the
        purpose shown. Like any online service, every provider can also see the IP address of the
        connection. We may also disclose personal data where the law requires it.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr>
              <th className={th}>Provider</th>
              <th className={th}>What it does for us</th>
              <th className={th}>What it receives</th>
            </tr>
          </thead>
          <tbody>
            {PROVIDERS.map((p) => (
              <tr key={p.name}>
                <td className={`${td} text-white`}>{p.name}</td>
                <td className={td}>{p.does}</td>
                <td className={td}>{p.receives}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className={h2}>Transfers outside Kenya</h2>
      <p>
        These providers are based outside Kenya and process data on servers outside Kenya, so using
        our contact form or creating an account involves transferring your personal data abroad.
        Countries outside Kenya may not give personal data the same legal protection, and public
        authorities there may have powers to access it. When you tick the box on our forms you agree
        to these transfers as described here.
      </p>
      <p>
        If you do not agree, please do not use the form. You can contact us about your data at the
        address below.
      </p>

      <h2 className={h2}>Cookies and similar storage</h2>
      <p>
        We use only the cookies and browser storage needed to make the site work and keep it secure.
        We do not use advertising or analytics cookies.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Purpose</th>
              <th className={th}>Lasts</th>
            </tr>
          </thead>
          <tbody>
            {COOKIES.map((c) => (
              <tr key={c.name}>
                <td className={`${td} text-white`}>{c.name}</td>
                <td className={td}>{c.purpose}</td>
                <td className={td}>{c.lasts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className={h2}>How long we keep it</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr>
              <th className={th}>Data</th>
              <th className={th}>How long</th>
            </tr>
          </thead>
          <tbody>
            {RETENTION.map((r) => (
              <tr key={r.data}>
                <td className={td}>{r.data}</td>
                <td className={td}>{r.kept}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        When a period ends we delete or anonymise the data. Copies held in our database
        provider&apos;s backups are overwritten on that provider&apos;s backup schedule. You can ask
        us to erase your data earlier; we will do so unless the law requires us to keep it, for
        example to establish or defend a legal claim.
      </p>

      <h2 className={h2}>Your rights</h2>
      <p>
        Under the Kenya Data Protection Act, 2019 you have the right to access your personal data,
        have it corrected, have it erased, object to or restrict certain processing, receive a copy
        of data you gave us in a portable form, and withdraw your consent at any time. Withdrawing
        consent does not affect what we did with your data before you withdrew it.
      </p>
      <p>
        To use any of these rights, email{' '}
        <a href="mailto:privacy@aluxplaza.com" className={link}>
          privacy@aluxplaza.com
        </a>
        . We may ask you to write from the email address on file so we can confirm the request is
        yours. It is free. We will respond within the periods set by the Data Protection (General)
        Regulations, 2021: 7 days for requests to access your data, and 14 days for requests to
        erase or correct it or to object to processing.
      </p>
      <p>
        If you do not agree to the use of your data described here, we cannot accept your message
        through the contact form or create your client account.
      </p>

      <h2 className={h2}>Complaints</h2>
      <p>
        If you are unhappy with how we handle your data, please tell us first at the address below.
        You also have the right to complain to the Office of the Data Protection Commissioner of
        Kenya at{' '}
        <a href="https://www.odpc.go.ke" target="_blank" rel="noopener noreferrer" className={link}>
          www.odpc.go.ke
        </a>
        .
      </p>

      <h2 className={h2}>Security</h2>
      <p>
        We apply reasonable technical and organizational measures to protect the data we hold,
        consistent with the same standards we recommend to our clients (see our{' '}
        <a href="/security" className={link}>
          Security
        </a>{' '}
        page for more).
      </p>

      <h2 className={h2}>Changes to this policy</h2>
      <p>
        If we change this policy we will update this page and the date at the top. If a change
        affects how we use data you have already given us in a way you would not expect, we will
        tell you.
      </p>

      <h2 className={h2}>Contact</h2>
      <p>
        Questions about this policy or your data can be sent to{' '}
        <a href="mailto:privacy@aluxplaza.com" className={link}>
          privacy@aluxplaza.com
        </a>
        .
      </p>
    </LegalPageLayout>
  );
}
