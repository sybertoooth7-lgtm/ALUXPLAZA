import { Shield, Search, ClipboardCheck, Lock, Network, ArrowRight } from 'lucide-react';
import { Link } from 'react-router';
import Navigation from '../sections/Navigation';
import Footer from '../sections/Footer';

const services = [
  {
    slug: 'incident-response',
    title: 'Incident Response',
    short: '24/7 retainer and active breach containment.',
    icon: <Shield className="w-8 h-8" />,
    color: 'from-alux-cyan to-alux-purple',
  },
  {
    slug: 'vulnerability-assessment',
    title: 'Vulnerability Assessment',
    short: 'Continuous scanning, prioritization, and remediation tracking.',
    icon: <Search className="w-8 h-8" />,
    color: 'from-alux-purple to-alux-gold',
  },
  {
    slug: 'compliance-readiness',
    title: 'Compliance Readiness',
    short: 'NIST, PCI DSS, and Kenya DPA gap analysis with scoring.',
    icon: <ClipboardCheck className="w-8 h-8" />,
    color: 'from-alux-gold to-alux-cyan',
  },
  {
    slug: 'data-protection-audit',
    title: 'Data Protection Audit',
    short: 'Kenya Data Protection Act 2019 assessments and remediation.',
    icon: <Lock className="w-8 h-8" />,
    color: 'from-alux-cyan to-alux-gold',
  },
  {
    slug: 'network-hardening',
    title: 'Network Hardening',
    short: 'Perimeter, segment, and monitor with measurable posture improvement.',
    icon: <Network className="w-8 h-8" />,
    color: 'from-alux-purple to-alux-cyan',
  },
];

export default function ServicesPage() {
  return (
    <div className="min-h-screen bg-navy-base text-white">
      <Navigation />
      <main className="pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-serif font-bold mb-6">
              Neural <span className="gradient-text-cyan">Services</span>
            </h1>
            <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto">
              Every engagement is scoped to your actual risk profile, priced for SME budgets, and
              mapped to standards you can audit.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((s) => (
              <Link
                key={s.slug}
                to={`/services/${s.slug}`}
                className="group bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 hover:border-alux-cyan/30 transition-all hover:-translate-y-1"
              >
                <div
                  className={`w-14 h-14 bg-gradient-to-br ${s.color} rounded-xl flex items-center justify-center mb-6 neural-glow`}
                >
                  <div className="text-navy-base">{s.icon}</div>
                </div>
                <h3 className="text-xl font-semibold mb-2 group-hover:text-alux-cyan transition-colors">
                  {s.title}
                </h3>
                <p className="text-[#94a3b8] text-sm mb-6 leading-relaxed">{s.short}</p>
                <span className="inline-flex items-center gap-1 text-alux-cyan text-sm font-medium">
                  Learn more{' '}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-20 bg-white/[0.03] border border-white/[0.06] rounded-3xl p-10 text-center">
            <h2 className="text-2xl font-serif font-bold mb-4">Not sure what you need?</h2>
            <p className="text-[#94a3b8] mb-8 max-w-xl mx-auto">
              Start with a free 30-minute discovery call. We'll map your current posture to the
              right service stack — no upsell, no filler.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-alux-cyan text-navy-base px-8 py-3 rounded-xl font-semibold hover:bg-white transition-colors"
            >
              Book Discovery Call
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
