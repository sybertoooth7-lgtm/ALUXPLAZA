import { Shield, MapPin, Users, Award, Globe } from 'lucide-react';
import { Link } from 'react-router';
import Navigation from '../sections/Navigation';
import Footer from '../sections/Footer';

const stats = [
  { label: 'SMEs Protected', value: '120+' },
  { label: 'Incidents Responded', value: '340+' },
  { label: 'Compliance Audits', value: '85+' },
  { label: 'Team Members', value: '18' },
];

const values = [
  {
    icon: <Shield className="w-6 h-6" />,
    title: 'Standards First',
    desc: 'Every recommendation maps to NIST, PCI DSS, or the Kenya Data Protection Act — not vague "best practices."',
  },
  {
    icon: <Users className="w-6 h-6" />,
    title: 'SME Focus',
    desc: 'Enterprise-grade security, priced and scoped for East African small and medium businesses.',
  },
  {
    icon: <Award className="w-6 h-6" />,
    title: 'Transparent Deliverables',
    desc: 'You own every report, script, and playbook. No black-box scoring, no hidden methodology.',
  },
  {
    icon: <Globe className="w-6 h-6" />,
    title: 'Local Context',
    desc: 'Built in Nairobi for Nairobi. We understand local infrastructure, regulator expectations, and supply-chain realities.',
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-navy-base text-white">
      <Navigation />
      <main className="pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero */}
          <div className="text-center mb-20">
            <h1 className="text-4xl md:text-6xl font-serif font-bold mb-6">
              Security Built on <span className="gradient-text-cyan">Standards</span>, Not Buzzwords
            </h1>
            <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto leading-relaxed">
              Alux Plaza is a Nairobi-based cybersecurity consultancy helping East African SMEs meet
              real compliance obligations — NIST SP 800-61, PCI DSS, and the Kenya Data Protection
              Act 2019 — with practical, affordable engagements.
            </p>
            <div className="flex items-center justify-center gap-2 mt-6 text-alux-cyan font-mono text-sm">
              <MapPin className="w-4 h-4" />
              <span>Nairobi, Kenya · Serving East Africa</span>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-24">
            {stats.map((s) => (
              <div
                key={s.label}
                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 text-center hover:border-alux-cyan/30 transition-colors"
              >
                <div className="text-3xl font-bold gradient-text-cyan mb-1">{s.value}</div>
                <div className="text-[#94a3b8] text-sm">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Values */}
          <div className="mb-24">
            <h2 className="text-3xl font-serif font-bold mb-12 text-center">How We Work</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {values.map((v) => (
                <div
                  key={v.title}
                  className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 hover:bg-white/[0.05] transition-colors"
                >
                  <div className="text-alux-cyan mb-4">{v.icon}</div>
                  <h3 className="font-semibold mb-2">{v.title}</h3>
                  <p className="text-[#94a3b8] text-sm leading-relaxed">{v.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="bg-gradient-to-br from-alux-cyan/10 via-alux-purple/10 to-alux-gold/10 border border-white/[0.06] rounded-3xl p-10 md:p-16 text-center">
            <h2 className="text-3xl font-serif font-bold mb-4">Ready to see how we can help?</h2>
            <p className="text-[#94a3b8] mb-8 max-w-xl mx-auto">
              Whether you need a full compliance readiness assessment or a targeted incident
              response retainer, we scope engagements to your actual risk profile.
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-2 bg-alux-cyan text-navy-base px-8 py-3 rounded-xl font-semibold hover:bg-white transition-colors"
            >
              <Shield className="w-5 h-5" />
              Book a Consultation
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
