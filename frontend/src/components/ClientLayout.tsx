// frontend/src/components/ClientLayout.tsx
// Shared header + nav for the authenticated client area. Fetches the current
// client's identity itself (via /api/client/me) so every page using this layout
// gets consistent auth-gating for free - a 401 redirects to /client/login
// without each page needing to duplicate that check.
//
// This mirrors components/AdminLayout.tsx, with one deliberate difference: the
// admin area is themed with the shared `bg-background`/`text-foreground` tokens
// while the client area uses the fixed `bg-navy-base`/`text-white` palette.
// Copying the admin class names verbatim would have rendered this header
// against the wrong background, so the structure is shared but the colours
// follow the client pages it has to sit on top of.

import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, Link, useLocation } from 'react-router';
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
}

export default function ClientLayout({ children }: ClientLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/client/me`, { credentials: 'include' });
        if (res.status === 401) {
          navigate('/client/login');
          return;
        }
        // /api/client/me answers 404 when the session's client row is gone
        // (e.g. deleted by an admin). That is a signed-out state, not a server
        // fault, so it gets the same treatment as 401 rather than an error box.
        if (res.status === 404) {
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
    // POST - must go through secureFetch so the CSRF header is sent. The
    // backend enforces CSRF verification globally on all non-GET requests,
    // including this one.
    await secureFetch('/api/client/logout', { method: 'POST' }).catch(() => {});
    clearSentryUser();
    navigate('/client/login');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-navy-base text-white flex items-center justify-center">
        <p className="text-white/50">Loading.</p>
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

  // One destination today. The backend already exposes /api/client/compliance,
  // /risk-score, /security-events and /sessions, so splitting those into their
  // own pages later is a matter of adding entries here.
  const navLinks = [{ to: '/client/dashboard', label: 'Dashboard' }];

  return (
    <div className="min-h-screen bg-navy-base text-white">
      <header className="border-b border-white/10 px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="font-serif text-lg text-alux-gold">ALUX PLAZA</h1>
            <p className="text-xs text-white/50 uppercase tracking-wider">Client</p>
          </div>
          <nav className="flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-white/10 text-white'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm">{client.company_name}</p>
            <p className="text-xs text-white/50">{client.email}</p>
          </div>
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="text-sm text-white/60 hover:text-white border border-white/15 rounded-lg px-4 py-2 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <main>{children(client)}</main>
    </div>
  );
}
