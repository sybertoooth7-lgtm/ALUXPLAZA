import LegalPageLayout from '../components/LegalPageLayout';

export default function SecurityPolicy() {
  return (
    <LegalPageLayout title="Security" lastUpdated="August 12, 2026">
      <p>
        As a cybersecurity consultancy, we hold our own infrastructure to the same standard we
        recommend to clients. This page covers how we approach our own security, and how to report a
        vulnerability if you find one.
      </p>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">How we protect this platform</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>
          Automated request inspection and blocking against common attack patterns (SQL injection,
          XSS, path traversal)
        </li>
        <li>Rate limiting and automatic blocking of abusive or brute-force traffic</li>
        <li>
          All administrative access requires authentication; sessions can be revoked at any time
        </li>
        <li>Security events are logged and reviewed</li>
      </ul>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">Responsible disclosure</h2>
      <p>
        If you believe you've found a security vulnerability in Alux Plaza's own systems (not a
        client's — for client environments, follow their disclosure policy instead), we want to
        know.
      </p>

      <h3 className="text-white font-semibold mt-6 mb-2">Scope</h3>
      <p>
        <strong className="text-white">In scope:</strong> aluxplaza.com and its subdomains, the Alux
        Plaza backend API and admin dashboard.
      </p>
      <p>
        <strong className="text-white">Out of scope:</strong> client systems assessed as part of our
        consulting engagements, third-party services we integrate with but do not operate, and
        denial-of-service testing of any kind.
      </p>

      <h3 className="text-white font-semibold mt-6 mb-2">How to report</h3>
      <p>
        Email <span className="text-alux-cyan">security@aluxplaza.com</span> with a description of
        the vulnerability, its potential impact, and steps to reproduce it. Please don't publicly
        disclose a vulnerability before we've had a chance to address it.
      </p>

      <h3 className="text-white font-semibold mt-6 mb-2">What to expect</h3>
      <ul className="list-disc pl-6 space-y-1">
        <li>Acknowledgment of your report within 5 business days</li>
        <li>Initial assessment within 10 business days</li>
        <li>
          Coordinated disclosure, typically within 90 days of report or upon fix, whichever comes
          sooner
        </li>
      </ul>

      <h3 className="text-white font-semibold mt-6 mb-2">Safe harbor</h3>
      <p>
        We will not pursue legal action against researchers who make a good-faith effort to avoid
        privacy violations, data destruction, or service disruption, report vulnerabilities
        promptly, and comply with this policy.
      </p>
    </LegalPageLayout>
  );
}
