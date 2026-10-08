import { Download, Mail, Newspaper, Mic } from 'lucide-react';
import Navigation from '../sections/Navigation';
import Footer from '../sections/Footer';

const releases = [
  {
    date: '2026-08-10',
    title: 'Alux Plaza Launches Compliance Readiness Tracker for Kenya DPA',
    excerpt:
      'New feature gives SMEs real-time visibility into their Data Protection Act posture with per-framework scoring and auditor-ready export.',
  },
  {
    date: '2026-06-22',
    title: 'Alux Plaza Secures Seed Funding to Expand East African Operations',
    excerpt:
      'Nairobi-based cybersecurity consultancy closes seed round to scale incident response and compliance services across Kenya, Uganda, and Tanzania.',
  },
  {
    date: '2026-04-05',
    title: 'Open-Source Shield WAF Engine Released Under MIT License',
    excerpt:
      'The in-house request inspection and blocking engine powering Alux Plaza is now available for community review and self-hosted deployment.',
  },
];

const assets = [
  { name: 'Brand Guidelines (PDF)', size: '2.4 MB', icon: <Download className="w-5 h-5" /> },
  { name: 'Logo Pack (PNG, SVG)', size: '8.1 MB', icon: <Download className="w-5 h-5" /> },
  { name: 'Executive Headshots', size: '12 MB', icon: <Download className="w-5 h-5" /> },
  { name: 'Fact Sheet (PDF)', size: '1.1 MB', icon: <Download className="w-5 h-5" /> },
];

export default function PressPage() {
  return (
    <div className="min-h-screen bg-navy-base text-white">
      <Navigation />
      <main className="pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-serif font-bold mb-6">
              Press & <span className="gradient-text-cyan">Media</span>
            </h1>
            <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto">
              For interview requests, speaker bookings, or media kit downloads, contact our
              communications team.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-12 mb-20">
            <div className="lg:col-span-2">
              <h2 className="text-2xl font-serif font-bold mb-6 flex items-center gap-2">
                <Newspaper className="w-6 h-6 text-alux-cyan" />
                Press Releases
              </h2>
              <div className="space-y-4">
                {releases.map((r) => (
                  <div
                    key={r.title}
                    className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 hover:border-alux-cyan/30 transition-colors"
                  >
                    <span className="text-xs font-mono text-alux-cyan mb-2 block">{r.date}</span>
                    <h3 className="text-lg font-semibold mb-2">{r.title}</h3>
                    <p className="text-[#94a3b8] text-sm leading-relaxed">{r.excerpt}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-8">
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Mic className="w-5 h-5 text-alux-purple" />
                  Media Contact
                </h3>
                <p className="text-[#94a3b8] text-sm mb-4">
                  For press inquiries, partnership discussions, or speaker requests:
                </p>
                <a
                  href="mailto:press@aluxplaza.co.ke"
                  className="inline-flex items-center gap-2 text-alux-cyan hover:text-white transition-colors text-sm"
                >
                  <Mail className="w-4 h-4" />
                  press@aluxplaza.co.ke
                </a>
              </div>

              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4">Media Kit</h3>
                <div className="space-y-3">
                  {assets.map((a) => (
                    <div
                      key={a.name}
                      className="flex items-center justify-between p-3 bg-white/[0.03] rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-alux-cyan">{a.icon}</div>
                        <div>
                          <div className="text-sm font-medium">{a.name}</div>
                          <div className="text-xs text-[#64748b]">{a.size}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
