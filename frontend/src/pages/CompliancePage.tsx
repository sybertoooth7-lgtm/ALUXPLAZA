import { Link } from 'react-router';
import LegalPageLayout from '../components/LegalPageLayout';

export default function CompliancePage() {
  return (
    <LegalPageLayout title="Compliance" lastUpdated="August 12, 2026">
      <p>
        Our assessments are grounded in established, publicly-documented frameworks rather than
        proprietary or black-box methodology. Below is what we reference and how we apply it.
      </p>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">Frameworks we work against</h2>

      <div className="space-y-4">
        <div>
          <h3 className="text-white font-semibold">PCI DSS</h3>
          <p>
            For any client handling cardholder data, we assess against the Payment Card Industry
            Data Security Standard's control requirements — network security, access control,
            encryption, monitoring, and more.
          </p>
        </div>

        <div>
          <h3 className="text-white font-semibold">Kenya Data Protection Act, 2019</h3>
          <p>
            For clients processing personal data of individuals in Kenya, we assess lawful basis for
            processing, data subject rights handling, breach notification readiness, and data
            processing registers.
          </p>
        </div>

        <div>
          <h3 className="text-white font-semibold">NIST SP 800-61</h3>
          <p>
            Our incident response planning work follows NIST's Computer Security Incident Handling
            Guide — covering preparation, detection, containment, eradication, and recovery.
          </p>
        </div>

        <div>
          <h3 className="text-white font-semibold">OWASP LLM Top 10</h3>
          <p>
            For clients building on large language models, we assess against OWASP's catalog of
            LLM-specific risks, such as prompt injection and insecure output handling.
          </p>
        </div>
      </div>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">How we track it</h2>
      <p>
        For active clients, compliance status is tracked item-by-item — not as a single pass/fail —
        so you can see exactly where you stand against each requirement, and what's still
        outstanding.
      </p>
      <p>
        If you're an existing client, you can view your live compliance status in the{' '}
        <Link to="/client/login" className="text-alux-cyan hover:underline">
          client portal
        </Link>
        .
      </p>
    </LegalPageLayout>
  );
}
