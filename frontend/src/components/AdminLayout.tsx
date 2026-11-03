// frontend/src/components/AdminLayout.tsx
// Shared header + nav for all authenticated admin pages. Fetches the
// current admin's identity itself (via /api/admin/me) so every page that
// uses this layout gets consistent auth-gating for free — a 401 redirects
// to /admin/login without each page needing to duplicate that check.

import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, Link, useLocation } from 'react-router';
import { API_BASE } from '@/lib/api';
import { secureFetch } from '@/lib/security';
import { ThemeToggle } from '@/components/theme-toggle';
import { setSentryUser, clearSentryUser } from '@/hooks/useAuthSentry';

interface AdminUser {
  id: number;
  email: string;
  role: 'readonly' | 'admin' | 'superadmin';
}

interface AdminLayoutProps {
  children: (admin: AdminUser) => ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/me`, { credentials: 'include' });
        if (res.status === 401) {
          navigate('/admin/login');
          return;
        }
        if (!res.ok) throw new Error('Failed to load admin account.');
        const data = await res.json();
        if (!mounted) return;
        if (data.mfaEnrollmentRequired) {
          navigate('/admin/mfa-setup');
          return;
        }
        setAdmin(data.user);
        setSentryUser(data.user.id, data.user.email, 'admin');
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
    await secureFetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
    clearSentryUser();
    navigate('/admin/login');
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error || !admin) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-4">
        <p className="text-destructive">{error || 'Not signed in.'}</p>
      </div>
    );
  }

  const navLinks = [
    { to: '/admin/dashboard', label: 'Dashboard' },
    { to: '/admin/submissions', label: 'Submissions' },
    { to: '/admin/security', label: 'Security' },
    ...(admin.role === 'superadmin' ? [{ to: '/admin/users', label: 'Users' }] : []),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div>
            <h1 className="font-serif text-lg text-alux-gold">ALUX PLAZA</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Admin</p>
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
          <span className="text-sm text-muted-foreground">{admin.email}</span>
          <ThemeToggle />
          <button
            onClick={handleLogout}
            className="text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-4 py-2 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <main>{children(admin)}</main>
    </div>
  );
}
