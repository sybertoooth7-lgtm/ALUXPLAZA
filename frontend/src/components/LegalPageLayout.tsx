import { Link } from 'react-router';
import { Shield } from 'lucide-react';

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}

export default function LegalPageLayout({ title, lastUpdated, children }: LegalPageLayoutProps) {
  return (
    <div className="min-h-screen bg-navy-base text-white">
      <header className="border-b border-white/10 px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-alux-cyan via-alux-purple to-alux-gold rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-navy-base" strokeWidth={2.5} />
            </div>
            <span className="text-lg font-serif font-bold tracking-wide">
              <span className="text-white">ALUX</span>{' '}
              <span className="gradient-text-cyan">PLAZA</span>
            </span>
          </Link>
          <Link to="/" className="text-sm text-white/60 hover:text-white transition-colors">
            ← Back to site
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-serif text-3xl text-alux-gold mb-2">{title}</h1>
        <p className="text-sm text-white/40 mb-10">Last updated: {lastUpdated}</p>
        <div className="prose-legal space-y-6 text-[#c5cdd8] leading-relaxed">{children}</div>
      </main>
    </div>
  );
}
