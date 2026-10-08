import LegalPageLayout from '../components/LegalPageLayout';

export default function TermsOfService() {
  return (
    <LegalPageLayout title="Terms of Service" lastUpdated="August 12, 2026">
      <p>
        These terms govern your use of the Alux Plaza website and any consulting services engaged
        through us. By using this site or engaging our services, you agree to the terms below.
      </p>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">Our services</h2>
      <p>
        Alux Plaza provides cybersecurity consulting services, including vulnerability assessments,
        incident response planning, and compliance-readiness reviews against standards such as PCI
        DSS, the Kenya Data Protection Act 2019, and NIST SP 800-61. The specific scope,
        deliverables, and timeline for any engagement are agreed separately in writing before work
        begins.
      </p>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">
        No guarantee of absolute security
      </h2>
      <p>
        Cybersecurity is a process of continuous risk reduction, not a one-time guarantee. Our
        assessments, recommendations, and tools reflect standard industry practice at the time they
        are delivered, but no consultancy — including us — can promise that a system will never be
        compromised. Findings and recommendations should be treated as professional advice for your
        own risk-management decisions, not as a warranty of security.
      </p>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">Client responsibilities</h2>
      <p>
        You're responsible for providing accurate information necessary to carry out an engagement,
        for implementing agreed remediations in your own environment, and for authorizing any
        testing performed against systems you own or control.
      </p>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">Confidentiality</h2>
      <p>
        We treat client information, findings, and engagement details as confidential, and will not
        disclose them to third parties without your consent, except where required by law.
      </p>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">Limitation of liability</h2>
      <p>
        To the extent permitted by law, Alux Plaza's liability for any claim arising from our
        services is limited to the fees paid for the specific engagement giving rise to the claim.
        We are not liable for indirect, incidental, or consequential damages.
      </p>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">Governing law</h2>
      <p>
        These terms are governed by the laws of Kenya. Any disputes will be subject to the
        jurisdiction of Kenyan courts.
      </p>

      <h2 className="text-white font-semibold text-xl mt-8 mb-3">Contact</h2>
      <p>
        Questions about these terms can be sent to{' '}
        <span className="text-alux-cyan">hello@aluxplaza.com</span>.
      </p>
    </LegalPageLayout>
  );
}
