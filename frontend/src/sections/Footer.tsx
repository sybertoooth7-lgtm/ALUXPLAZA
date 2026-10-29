import { Link } from 'react-router';

const footerLinks = [
  {
    title: 'Services',
    links: [
      { label: 'Incident response', to: '/services/incident-response' },
      { label: 'Vulnerability assessment', to: '/services/vulnerability-assessment' },
      { label: 'PCI DSS readiness', to: '/services/compliance-readiness' },
      { label: 'Data protection audit', to: '/services/data-protection-audit' },
      { label: 'Network hardening', to: '/services/network-hardening' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', to: '/about' },
      { label: 'Blog', to: '/blog' },
      { label: 'Client login', to: '/client/login' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy policy', to: '/privacy-policy' },
      { label: 'Terms of service', to: '/terms-of-service' },
      { label: 'Security', to: '/security' },
      { label: 'Compliance', to: '/compliance' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="bg-site-base border-t border-site-rule pt-14 pb-8">
      <div className="max-w-6xl mx-auto px-5 sm:px-8">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-x-8 gap-y-10">
          <div className="col-span-2 md:col-span-4">
            <p className="font-head font-semibold text-lg text-site-text">Alux Plaza</p>
            <p className="font-text text-site-muted mt-3 max-w-xs leading-relaxed">
              Cybersecurity consulting for businesses in Nairobi and across East Africa.
            </p>
          </div>

          {footerLinks.map((group, i) => (
            <div
              key={group.title}
              className={i === 0 ? 'md:col-span-3 md:col-start-6' : 'md:col-span-2'}
            >
              <h2 className="font-head font-semibold text-sm text-site-text mb-4">{group.title}</h2>
              <ul className="space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="font-text text-[15px] text-site-muted hover:text-site-text transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 pt-6 border-t border-site-rule flex flex-col sm:flex-row justify-between gap-2">
          <p className="font-text text-sm text-site-muted">
            &copy; 2026 Alux Plaza. All rights reserved.
          </p>
          <p className="font-text text-sm text-site-muted">Nairobi, Kenya</p>
        </div>
      </div>
    </footer>
  );
}
