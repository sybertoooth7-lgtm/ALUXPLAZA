import { Lock, FileSearch, UserCheck, Database, Scale } from 'lucide-react';
import ServiceLayout from '../components/ServiceLayout';

export default function DataProtectionAuditPage() {
  return (
    <ServiceLayout
      title="Data Protection Audit"
      subtitle="Kenya Data Protection Act 2019 assessments and remediation."
      icon={<Lock className="w-7 h-7 text-navy-base" />}
    >
      <div className="space-y-16">
        <section>
          <h2 className="text-2xl font-serif font-bold text-white mb-4">
            Beyond Checkbox Compliance
          </h2>
          <p className="text-[#94a3b8] leading-relaxed mb-6">
            The Kenya Data Protection Act 2019 isn't just about having a privacy policy. It mandates
            lawful processing, data minimization, security safeguards, and breach notification —
            with real penalties for non-compliance. Our audit assesses your actual practices against
            every Section 31 obligation.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex items-start gap-4">
              <FileSearch className="w-6 h-6 text-alux-cyan flex-shrink-0" />
              <div>
                <h4 className="font-semibold mb-1">Data Mapping & Inventory</h4>
                <p className="text-[#94a3b8] text-sm">
                  Identify what personal data you collect, where it lives, who has access, and how
                  long you keep it.
                </p>
              </div>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex items-start gap-4">
              <UserCheck className="w-6 h-6 text-alux-purple flex-shrink-0" />
              <div>
                <h4 className="font-semibold mb-1">Consent & Lawfulness Review</h4>
                <p className="text-[#94a3b8] text-sm">
                  Validate that every processing activity has a lawful basis and that consent
                  mechanisms meet ODPC standards.
                </p>
              </div>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex items-start gap-4">
              <Database className="w-6 h-6 text-alux-gold flex-shrink-0" />
              <div>
                <h4 className="font-semibold mb-1">Technical Safeguards</h4>
                <p className="text-[#94a3b8] text-sm">
                  Encryption at rest and in transit, access controls, audit logging, and breach
                  detection capability.
                </p>
              </div>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex items-start gap-4">
              <Scale className="w-6 h-6 text-alux-cyan flex-shrink-0" />
              <div>
                <h4 className="font-semibold mb-1">DPA Readiness Report</h4>
                <p className="text-[#94a3b8] text-sm">
                  Executive and technical reports formatted for ODPC submission or internal board
                  review.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-gradient-to-br from-alux-cyan/10 via-transparent to-transparent border border-white/[0.06] rounded-2xl p-8">
          <h3 className="text-xl font-semibold mb-4">Who Needs This?</h3>
          <div className="grid md:grid-cols-3 gap-6 text-sm text-[#94a3b8]">
            <div>
              <strong className="text-white block mb-1">Fintech & Payments</strong>
              Handling KYC data, transaction records, and credit information under strict regulatory
              scrutiny.
            </div>
            <div>
              <strong className="text-white block mb-1">Healthcare Providers</strong>
              Patient data is sensitive personal data under the Act. Higher safeguards and
              breach-notification obligations apply.
            </div>
            <div>
              <strong className="text-white block mb-1">E-Commerce & SaaS</strong>
              Collecting customer emails, phone numbers, and location data requires clear privacy
              notices and lawful processing.
            </div>
          </div>
        </section>
      </div>
    </ServiceLayout>
  );
}
