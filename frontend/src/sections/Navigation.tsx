import { useState } from 'react';
import { Link } from 'react-router';
import { Menu, X } from 'lucide-react';

const links = [
  { label: 'Services', to: '/services' },
  { label: 'How it works', to: '/#process' },
  { label: 'About', to: '/about' },
  { label: 'Security', to: '/security' },
];

export default function Navigation() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-site-base border-b border-site-rule">
      <nav
        aria-label="Main"
        className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between"
      >
        <Link
          to="/"
          onClick={close}
          className="font-head font-semibold text-lg text-site-text tracking-tight"
        >
          Alux Plaza
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <Link
              key={l.label}
              to={l.to}
              className="nav-link font-head text-sm text-site-muted hover:text-site-text transition-colors"
            >
              {l.label}
            </Link>
          ))}
          <Link
            to="/client/login"
            className="font-head text-sm text-site-muted hover:text-site-text transition-colors"
          >
            Client login
          </Link>
          <Link
            to="/#contact"
            className="font-head text-sm font-semibold bg-site-accent text-site-base px-4 py-2 rounded hover:bg-site-accent-hover transition-colors"
          >
            Request an assessment
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="md:hidden p-2 -mr-2 text-site-text"
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {open && (
        <div id="mobile-menu" className="md:hidden border-t border-site-rule bg-site-base">
          <div className="px-5 py-4 flex flex-col">
            {[...links, { label: 'Client login', to: '/client/login' }].map((l) => (
              <Link
                key={l.label}
                to={l.to}
                onClick={close}
                className="font-head text-base text-site-text py-3 border-b border-site-rule"
              >
                {l.label}
              </Link>
            ))}
            <Link
              to="/#contact"
              onClick={close}
              className="mt-4 text-center font-head font-semibold bg-site-accent text-site-base px-4 py-3 rounded"
            >
              Request an assessment
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
