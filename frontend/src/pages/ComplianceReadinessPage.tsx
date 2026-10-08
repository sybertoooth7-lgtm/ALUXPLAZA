import { ClipboardCheck, BookOpen, Target, BarChart3 } from 'lucide-react';
import ServiceLayout from '../components/ServiceLayout';

const frameworks = [
  {
    name: 'NIST Cybersecurity Framework',
    items: '108 checklist items',
    desc: 'Identify, Protect, Detect, Respond, Recover — mapped to your actual controls and scored continuously.',
  },
  {
    name: 'PCI DSS v4.0',
    items: '78 checklist items',
    desc: 'For any organization handling cardholder data. We scope SAQ selection and track every requirement.',
  },
  {
    name: 'Kenya Data Protection Act 2019',
    items: '42 checklist items',
    desc: 'Full Section 31 readiness assessment with data-mapping, consent review, and DPO advisory.',
  },
];

export default function ComplianceReadinessPage() {
  return (
    <ServiceLayout
      title="Compliance Readiness"
      subtitle="NIST, PCI DSS, and Kenya DPA gap analysis with real-time scoring."
      icon={<ClipboardCheck className="w-7 h-7 text-navy-base" />}
    >
      <div className="space-y-16">
        <section>
          <h2 className="text-2xl font-serif font-bold text-white mb-4">
            Compliance Is a Moving Target
          </h2>
          <p className="text-[#94a3b8] leading-relaxed mb-6">
            Most compliance efforts fail because they are point-in-time. We build living compliance
            trackers that update as your environment changes — so you're never surprised by an
            auditor or a regulator.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            {frameworks.map((f) => (
              <div
                key={f.name}
                className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6"
              >
                <h4 className="font-semibold mb-2 text-alux-cyan">{f.name}</h4>
                <span className="text-xs font-mono bg-white/[0.05] px-2 py-1 rounded-full text-[#94a3b8]">
                  {f.items}
                </span>
                <p className="text-[#94a3b8] text-sm mt-4 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-serif font-bold text-white mb-6">How It Works</h2>
          <div className="grid md:grid-cols-4 gap-4">
            {[
              {
                icon: <BookOpen className="w-6 h-6" />,
                title: 'Discovery',
                desc: 'Map your data flows, assets, and existing policies.',
              },
              {
                icon: <Target className="w-6 h-6" />,
                title: 'Gap Analysis',
                desc: 'Compare current state against framework requirements.',
              },
              {
                icon: <ClipboardCheck className="w-6 h-6" />,
                title: 'Remediation',
                desc: 'Prioritized action plan with clear owners and deadlines.',
              },
              {
                icon: <BarChart3 className="w-6 h-6" />,
                title: 'Continuous Tracking',
                desc: 'Live score dashboard that updates as you fix gaps.',
              },
            ].map((s) => (
              <div
                key={s.title}
                className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 text-center"
              >
                <div className="text-alux-cyan mb-3 flex justify-center">{s.icon}</div>
                <h4 className="font-semibold mb-2">{s.title}</h4>
                <p className="text-[#94a3b8] text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </ServiceLayout>
  );
}
