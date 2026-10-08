import { Calendar, Clock, ArrowRight, Tag } from 'lucide-react';
import Navigation from '../sections/Navigation';
import Footer from '../sections/Footer';

const posts = [
  {
    slug: 'kenya-data-protection-act-checklist',
    title: 'The Kenya Data Protection Act 2019: A Practical Compliance Checklist for SMEs',
    excerpt:
      "Most Kenyan SMEs know they need to comply — few know where to start. Here is a ground-level checklist mapped directly to the Act's obligations.",
    date: '2026-08-12',
    readTime: '8 min read',
    tags: ['Compliance', 'Kenya DPA'],
    featured: true,
  },
  {
    slug: 'incident-response-retainers',
    title: 'Why Your SME Needs an Incident Response Retainer Before You Need Incident Response',
    excerpt:
      'When a breach happens, the first 24 hours determine the next 24 months. We break down what a retainer actually covers and why it pays for itself.',
    date: '2026-07-28',
    readTime: '6 min read',
    tags: ['Incident Response', 'SME'],
    featured: false,
  },
  {
    slug: 'nist-vs-pci-dss',
    title: 'NIST CSF vs. PCI DSS: Which Framework Should East African Fintechs Prioritize?',
    excerpt:
      'Fintechs in Nairobi face dual pressure: global card-network rules and local regulator expectations. We compare the two frameworks side by side.',
    date: '2026-07-14',
    readTime: '10 min read',
    tags: ['Fintech', 'Frameworks'],
    featured: false,
  },
  {
    slug: 'shield-waf-internals',
    title: 'Inside Shield: How We Built an Evasion-Resistant WAF in Pure Node.js',
    excerpt:
      'A deep dive into the normalization pipeline, signature design, and false-positive tuning that powers our in-house request inspector.',
    date: '2026-06-30',
    readTime: '12 min read',
    tags: ['Engineering', 'WAF'],
    featured: false,
  },
  {
    slug: 'password-policy-myths',
    title: 'Why "Complex Passwords" Are No Longer Enough (And What to Do Instead)',
    excerpt:
      'NIST SP 800-63B changed the game on password policy. We explain why length beats complexity, and how to implement modern auth without friction.',
    date: '2026-06-15',
    readTime: '7 min read',
    tags: ['Authentication', 'NIST'],
    featured: false,
  },
];

export default function BlogPage() {
  const featured = posts.find((p) => p.featured);
  const rest = posts.filter((p) => !p.featured);

  return (
    <div className="min-h-screen bg-navy-base text-white">
      <Navigation />
      <main className="pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-6xl font-serif font-bold mb-6">
              The <span className="gradient-text-cyan">Signal</span>
            </h1>
            <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto">
              Practical security writing for East African SMEs. No FUD, no vendor fluff — just
              standards, code, and field notes.
            </p>
          </div>

          {featured && (
            <div className="mb-16">
              <div className="bg-gradient-to-br from-alux-cyan/10 via-alux-purple/5 to-transparent border border-white/[0.06] rounded-3xl p-8 md:p-12 hover:border-alux-cyan/30 transition-colors">
                <div className="flex flex-wrap gap-2 mb-4">
                  {featured.tags.map((t) => (
                    <span
                      key={t}
                      className="text-xs font-mono bg-alux-cyan/10 text-alux-cyan px-3 py-1 rounded-full"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <h2 className="text-2xl md:text-4xl font-serif font-bold mb-4 max-w-3xl">
                  {featured.title}
                </h2>
                <p className="text-[#94a3b8] text-lg mb-6 max-w-2xl leading-relaxed">
                  {featured.excerpt}
                </p>
                <div className="flex items-center gap-4 text-sm text-[#64748b] mb-6">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {featured.date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {featured.readTime}
                  </span>
                </div>
                <button className="inline-flex items-center gap-2 text-alux-cyan hover:text-white transition-colors font-semibold">
                  Read featured post <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {rest.map((post) => (
              <article
                key={post.slug}
                className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 hover:border-alux-cyan/30 transition-colors flex flex-col"
              >
                <div className="flex flex-wrap gap-2 mb-3">
                  {post.tags.map((t) => (
                    <span
                      key={t}
                      className="text-xs font-mono bg-white/[0.05] text-[#94a3b8] px-2 py-0.5 rounded-full flex items-center gap-1"
                    >
                      <Tag className="w-3 h-3" />
                      {t}
                    </span>
                  ))}
                </div>
                <h3 className="text-lg font-semibold mb-3 leading-snug hover:text-alux-cyan transition-colors cursor-pointer">
                  {post.title}
                </h3>
                <p className="text-[#94a3b8] text-sm mb-4 leading-relaxed flex-grow">
                  {post.excerpt}
                </p>
                <div className="flex items-center justify-between text-xs text-[#64748b] pt-4 border-t border-white/[0.06]">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {post.date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {post.readTime}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
