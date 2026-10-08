import { Shield, Clock, FileText, Users, AlertTriangle, CheckCircle } from 'lucide-react';
import ServiceLayout from '../components/ServiceLayout';

const phases = [
  {
    title: 'Preparation',
    desc: 'Playbook development, retainer onboarding, and contact tree validation.',
  },
  {
    title: 'Identification',
    desc: 'Triage incoming alerts, confirm breach scope, and preserve evidence.',
  },
  {
    title: 'Containment',
    desc: 'Short-term isolation to stop bleeding; long-term segmentation to prevent recurrence.',
  },
  {
    title: 'Eradication',
    desc: 'Remove attacker presence, patch root cause, and validate clean state.',
  },
  {
    title: 'Recovery',
    desc: 'Restore systems with monitoring hardening and phased return to production.',
  },
  {
    title: 'Lessons Learned',
    desc: 'Post-incident report with timeline, IOCs, and actionable remediation.',
  },
];

export default function IncidentResponsePage() {
  return (
    <ServiceLayout
      title="Incident Response"
      subtitle="24/7 retainer and active breach containment for East African SMEs."
      icon={<Shield className="w-7 h-7 text-navy-base" />}
    >
      <div className="space-y-16">
        <section>
          <h2 className="text-2xl font-serif font-bold text-white mb-4">
            The First 24 Hours Decide Everything
          </h2>
          <p className="text-[#94a3b8] leading-relaxed mb-6">
            Most SMEs don't have a dedicated SOC. When a breach happens, the response is chaotic,
            evidence is lost, and recovery takes months. Our Incident Response retainer gives you a
            direct line to experienced responders who follow NIST SP 800-61 guidelines — so you
            contain fast, recover clean, and document everything for regulators and insurers.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
              <Clock className="w-6 h-6 text-alux-cyan mb-3" />
              <h4 className="font-semibold mb-1">15-Minute SLA</h4>
              <p className="text-[#94a3b8] text-sm">
                Retainer clients get acknowledged within 15 minutes, 24/7.
              </p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
              <FileText className="w-6 h-6 text-alux-purple mb-3" />
              <h4 className="font-semibold mb-1">Auditor-Ready Reports</h4>
              <p className="text-[#94a3b8] text-sm">
                Every action is timestamped and documented for DPA or PCI DSS follow-up.
              </p>
            </div>
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
              <Users className="w-6 h-6 text-alux-gold mb-3" />
              <h4 className="font-semibold mb-1">Local Context</h4>
              <p className="text-[#94a3b8] text-sm">
                We know Kenyan ISP landscapes, M-Pesa integration risks, and local threat actors.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-serif font-bold text-white mb-6">Our IR Lifecycle</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {phases.map((p, i) => (
              <div
                key={p.title}
                className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 relative"
              >
                <span className="absolute top-4 right-4 text-4xl font-bold text-white/[0.04]">
                  {i + 1}
                </span>
                <h4 className="font-semibold mb-2 text-alux-cyan">{p.title}</h4>
                <p className="text-[#94a3b8] text-sm leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gradient-to-br from-alux-cyan/10 via-transparent to-transparent border border-white/[0.06] rounded-2xl p-8">
          <div className="flex items-start gap-4">
            <AlertTriangle className="w-8 h-8 text-alux-gold flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-xl font-semibold mb-2">Active Breach? Call Now.</h3>
              <p className="text-[#94a3b8] mb-4">
                If you suspect an active breach and don't have a retainer, we still answer. The
                first hour is free to assess scope and recommend immediate containment steps.
              </p>
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-2 text-sm text-alux-cyan bg-alux-cyan/10 px-4 py-2 rounded-full">
                  <CheckCircle className="w-4 h-4" />
                  +254 700 000 000
                </span>
                <span className="inline-flex items-center gap-2 text-sm text-alux-cyan bg-alux-cyan/10 px-4 py-2 rounded-full">
                  <CheckCircle className="w-4 h-4" />
                  ir@aluxplaza.co.ke
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </ServiceLayout>
  );
}
