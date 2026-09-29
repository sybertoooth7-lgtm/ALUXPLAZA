// frontend/src/components/ClientLayout.tsx
// Shared sidebar + header shell for the authenticated client area.
//
// Redesigned from the original top-header layout to a sidebar navigation
// pattern — the standard for modern dashboards. The sidebar carries the
// brand, primary navigation, and the client's identity; a slim topbar
// carries the page-agnostic actions (theme toggle, logout). On mobile the
// sidebar collapses to an off-canvas drawer.
//
// Auth-gating is unchanged: /api/client/me is fetched on mount and a 401
// or 404 (deleted client) redirects to /client/login before any child
// content renders, so every page using this layout gets that for free.

import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, NavLink, useLocation } from 'react-router';
import { API_BASE } from '@/lib/api';
import { secureFetch } from '@/lib/security';
import { ThemeToggle } from '@/components/theme-toggle';
import { setSentryUser, clearSentryUser } from '@/hooks/useAuthSentry';

export interface ClientInfo {
  id: number;
  company_name: string;
  email: string;
}

interface ClientLayoutProps {
  children: (client: ClientInfo) => ReactNode;
  /** Optional page title shown in the topbar. */
  title?: string;
}

// Single source of truth for the client-area navigation. Adding a page
// later is just a matter of adding an entry here and a route in App.tsx.
const NAV_ITEMS = [
  {
    to: '/client/dashboard',
    label: 'Dashboard',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <rect x="3" y="3" width="7" height="9" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="12" width="7" height="9" rx="1.5" />
        <rect x="3" y="16" width="7" height="5" rx="1.5" />
      </svg>
    ),
  },
  {
    to: '/client/compliance',
    label: 'Compliance',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <path d="M9 12l2 2 4-4" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  {
    to: '/client/security',
    label: 'Security',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <path d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
      </svg>
    ),
  },
  {
    to: '/client/sessions',
    label: 'Sessions',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="w-5 h-5">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 9h10M7 13h6" />
      </svg>
    ),
  },
];

// Initials avatar — deterministic colour from the company name so the
// same client always gets the same hue without storing anything extra.
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const AVATAR_HUES = [
  'bg-alux-gold/20 text-alux-gold',
  'bg-alux-cyan/20 text-alux-cyan',
  'bg-alux-purple/20 text-alux-purple',
  'bg-alux-green/20 text-alux-green',
];

function avatarClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_HUES[Math.abs(hash) % AVATAR_HUES.length];
}

export default function ClientLayout({ children, title }: ClientLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/client/me`, { credentials: 'include' });
        if (res.status === 401 || res.status === 404) {
          navigate('/client/login');
          return;
        }
        if (!res.ok) throw new Error('Failed to load your account.');
        const data = await res.json();
        if (!mounted) return;
        setClient(data.client);
        setSentryUser(data.client.id, data.client.email, 'client');
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  async function handleLogout() {
    await secureFetch('/api/client/logout', { method: 'POST' }).catch(() => {});
    clearSentryUser();
    navigate('/client/login');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-base text-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-alux-gold/30 border-t-alux-gold rounded-full animate-spin" />
          <p className="text-white/40 text-sm">Loading your workspace…</p>
        </div>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="min-h-screen bg-navy-base text-white flex items-center justify-center px-4">
        <p className="text-alux-red">{error || 'Not signed in.'}</p>
      </div>
    );
  }

  const sidebar = (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-white/5">
        <h1 className="font-serif text-xl text-alux-gold leading-tight">ALUX PLAZA</h1>
        <p className="text-[10px] text-white/40 uppercase tracking-[0.2em] mt-0.5">Client Portal</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-150 ${
                isActive
                  ? 'bg-alux-gold/10 text-alux-gold border border-alux-gold/20'
                  : 'text-white/50 hover:text-white hover:bg-white/5 border border-transparent'
              }`
            }
          >
            {item.icon}
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Identity card */}
      <div className="px-3 pb-3">
        <div className="bg-navy-surface border border-white/10 rounded-xl p-3 flex items-center gap-3">
          <div
            className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold font-mono ${avatarClass(
              client.company_name
            )}`}
          >
            {initials(client.company_name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{client.company_name}</p>
            <p className="text-xs text-white/40 truncate">{client.email}</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-navy-base text-white flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-white/5 bg-navy-surface/50">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-navy-surface border-r border-white/10 animate-[slide-in_0.2s_ease-out]">
            {sidebar}
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex items-center gap-4 px-4 sm:px-6 h-16 border-b border-white/5 bg-navy-base/80 backdrop-blur-md">
          {/* Mobile hamburger */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
            aria-label="Open navigation"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {title && <h2 className="font-serif text-lg text-white/90 truncate">{title}</h2>}

          <div className="flex-1" />

          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="text-sm text-white/50 hover:text-white border border-white/10 hover:border-white/25 rounded-lg px-3.5 py-1.5 transition-colors"
          >
            Logout
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1">{children(client)}</main>
      </div>
    </div>
  );
}
