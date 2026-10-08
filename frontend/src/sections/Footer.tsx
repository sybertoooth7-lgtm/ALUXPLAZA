import { Link } from 'react-router';
import { Shield } from 'lucide-react';

const footerLinks = {
  services: {
    title: 'Neural Services',
    links: [
      { label: 'Incident Response', to: '/services/incident-response' },
      { label: 'Vulnerability Assessment', to: '/services/vulnerability-assessment' },
      { label: 'Compliance Readiness', to: '/services/compliance-readiness' },
      { label: 'Data Protection Audit', to: '/services/data-protection-audit' },
      { label: 'Network Hardening', to: '/services/network-hardening' },
    ],
  },
  company: {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'AI Lab', to: '/ai-lab' },
      { label: 'Careers', to: '/careers' },
      { label: 'Blog', to: '/blog' },
      { label: 'Press', to: '/press' },
    ],
  },
  legal: {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', to: '/privacy-policy' },
      { label: 'Terms of Service', to: '/terms-of-service' },
      { label: 'Security', to: '/security' },
      { label: 'Compliance', to: '/compliance' },
    ],
  },
};

export default function Footer() {
  return (
    <footer className="bg-navy-base border-t border-white/[0.06] pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Logo & Description */}
          <div className="lg:col-span-1 md:col-span-2">
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-8 h-8 bg-gradient-to-br from-alux-cyan via-alux-purple to-alux-gold rounded-lg flex items-center justify-center neural-glow">
                <Shield className="w-5 h-5 text-navy-base" strokeWidth={2.5} />
              </div>
              <span className="text-xl font-serif font-bold tracking-wide">
                <span className="text-white">ALUX</span>{' '}
                <span className="gradient-text-cyan">PLAZA</span>
              </span>
            </div>
            <p className="text-[#94a3b8] text-sm max-w-xs mb-6 leading-relaxed">
              Cybersecurity consulting based in Nairobi, Kenya. Practical deliverables built on real
              standards — not black-box claims.
            </p>
            <div className="flex space-x-3">
              <a
                href="#"
                className="w-10 h-10 bg-white/[0.06] rounded-lg flex items-center justify-center text-[#94a3b8] hover:bg-alux-cyan hover:text-navy-base transition-all"
                aria-label="Twitter"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z" />
                </svg>
              </a>
              <a
                href="#"
                className="w-10 h-10 bg-white/[0.06] rounded-lg flex items-center justify-center text-[#94a3b8] hover:bg-alux-purple hover:text-white transition-all"
                aria-label="LinkedIn"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                </svg>
              </a>
            </div>
          </div>

          {/* Neural Services */}
          <div>
            <h4 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
              {footerLinks.services.title}
            </h4>
            <ul className="space-y-3">
              {footerLinks.services.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-[#94a3b8] text-sm hover:text-alux-cyan transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
              {footerLinks.company.title}
            </h4>
            <ul className="space-y-3">
              {footerLinks.company.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-[#94a3b8] text-sm hover:text-alux-cyan transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="text-white font-semibold text-sm uppercase tracking-wider mb-4">
              {footerLinks.legal.title}
            </h4>
            <ul className="space-y-3">
              {footerLinks.legal.links.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-[#94a3b8] text-sm hover:text-alux-cyan transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/[0.06] pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[#475569] text-xs">&copy; 2026 Alux Plaza. All rights reserved.</p>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-alux-green rounded-full animate-pulse" />
            <span className="text-alux-cyan font-mono text-xs">Nairobi, Kenya</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
