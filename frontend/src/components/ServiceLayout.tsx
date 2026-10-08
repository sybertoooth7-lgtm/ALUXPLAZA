import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import Navigation from '../sections/Navigation';
import Footer from '../sections/Footer';

interface ServiceLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  icon: React.ReactNode;
}

export default function ServiceLayout({ title, subtitle, children, icon }: ServiceLayoutProps) {
  return (
    <div className="min-h-screen bg-navy-base text-white">
      <Navigation />
      <main className="pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            to="/services"
            className="inline-flex items-center gap-2 text-alux-cyan hover:text-white transition-colors text-sm mb-8"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Neural Services
          </Link>

          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 bg-gradient-to-br from-alux-cyan via-alux-purple to-alux-gold rounded-xl flex items-center justify-center neural-glow">
              {icon}
            </div>
            <div>
              <h1 className="text-4xl md:text-5xl font-serif font-bold gradient-text-cyan">
                {title}
              </h1>
              <p className="text-[#94a3b8] mt-2 text-lg">{subtitle}</p>
            </div>
          </div>

          <div className="prose prose-invert prose-lg max-w-none text-[#cbd5e1]">{children}</div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
