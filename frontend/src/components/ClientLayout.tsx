// frontend/src/components/ClientLayout.tsx
// Shared header + nav for the authenticated client area. Fetches the current
// client's identity itself (via /api/client/me) so every page using this layout
// gets consistent auth-gating for free - a 401 redirects to /client/login
// without each page needing to duplicate that check.
//
// Mirrors components/AdminLayout.tsx, including its theming: surfaces and text
// use the shared `bg-background` / `text-foreground` / `border-border` tokens,
// so the header's theme toggle actually changes the client area. (An earlier
// version used the fixed navy palette, which made the toggle a no-op here.)

import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, Link, useLocation } from 'react-router';
import { API_BASE } from '@/lib/api';
import { secureFetch } from '@/lib/security';
import { GOLD_TEXT } from '@/lib/clientStatus';
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

const NAV_LINKS = [
  { to: '/client/dashboard', label: 'Dashboard' },
  { to: '/client/compliance', label: 'Compliance' },
  { to: '/client/security', label: 'Security' },
];

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
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
        <p className="text-destructive">{error || 'Not signed in.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <h1 className={`font-serif text-lg ${GOLD_TEXT}`}>ALUX PLAZA</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Client</p>
          </div>
          <nav className="flex items-center gap-1" aria-label="Client area">
            {NAV_LINKS.map((link) => {
              const isActive = location.pathname === link.to;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  aria-current={isActive ? 'page' : undefined}
                  className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
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
            <p className="text-xs text-muted-foreground">{client.email}</p>
          </div>
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-4 py-2 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <main>{children(client)}</main>
    </div>
  );
}
