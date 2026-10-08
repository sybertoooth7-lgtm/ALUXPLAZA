import { Brain, Cpu, Lock, FileText, Zap } from 'lucide-react';
import Navigation from '../sections/Navigation';
import Footer from '../sections/Footer';

const projects = [
  {
    title: 'Shield WAF Engine',
    desc: 'Our in-house pattern-detection engine with evasion-resistant normalization. Deployed across all Alux Plaza client environments.',
    tags: ['Node.js', 'Security', 'WAF'],
  },
  {
    title: 'Risk Score Compute',
    desc: 'Real-time compliance scoring across NIST, PCI DSS, and Kenya DPA frameworks. Always computed fresh — never stale cached scores.',
    tags: ['PostgreSQL', 'Analytics', 'Compliance'],
  },
  {
    title: 'LLM Security Reviewer',
    desc: 'Automated source-code analysis pipeline that flags unsafe patterns, secret leakage, and injection vectors before they reach production.',
    tags: ['Python', 'LLM', 'SAST'],
  },
  {
    title: 'Auth Audit Scanner',
    desc: 'Lightweight external authentication posture scanner. Checks HSTS, CSP, cookie flags, and password-field autocomplete across any public endpoint.',
    tags: ['Node.js', 'Python', 'OSINT'],
  },
];

export default function AILabPage() {
  return (
    <div className="min-h-screen bg-navy-base text-white">
      <Navigation />
      <main className="pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-alux-cyan/10 text-alux-cyan px-4 py-1.5 rounded-full text-sm font-mono mb-6">
              <Brain className="w-4 h-4" />
              <span>Research & Development</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-serif font-bold mb-6">
              The <span className="gradient-text-cyan">AI Lab</span>
            </h1>
            <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto leading-relaxed">
              We build our own tools. The same automation and detection pipelines we use internally
              are refined, documented, and made available to our clients.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-20">
            {projects.map((p) => (
              <div
                key={p.title}
                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-8 hover:border-alux-cyan/30 transition-colors group"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Cpu className="w-6 h-6 text-alux-cyan group-hover:text-alux-gold transition-colors" />
                  <h3 className="text-xl font-semibold">{p.title}</h3>
                </div>
                <p className="text-[#94a3b8] mb-6 leading-relaxed">{p.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="text-xs font-mono bg-white/[0.05] text-alux-cyan px-3 py-1 rounded-full"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div className="p-6">
              <Zap className="w-8 h-8 text-alux-gold mx-auto mb-4" />
              <h4 className="font-semibold mb-2">Automated First</h4>
              <p className="text-[#94a3b8] text-sm">
                Every repetitive check is scripted before a human touches it. Humans validate;
                machines enumerate.
              </p>
            </div>
            <div className="p-6">
              <Lock className="w-8 h-8 text-alux-purple mx-auto mb-4" />
              <h4 className="font-semibold mb-2">Security by Design</h4>
              <p className="text-[#94a3b8] text-sm">
                Our tools eat our own dog food. They run against our infrastructure before they ever
                touch a client environment.
              </p>
            </div>
            <div className="p-6">
              <FileText className="w-8 h-8 text-alux-cyan mx-auto mb-4" />
              <h4 className="font-semibold mb-2">Open Methodology</h4>
              <p className="text-[#94a3b8] text-sm">
                No black boxes. Every detection rule, scoring algorithm, and audit script is
                documented and reviewable.
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
