// frontend/src/pages/AdminMfaSetup.tsx
// Shown to an admin who has signed in but has not set up two-factor
// authentication yet. While MFA is required, the server only lets that session
// reach the enrolment endpoints, so this is the one page they can use.

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { API_BASE } from '@/lib/api';
import { secureFetch } from '@/lib/security';
import MfaSetup from '@/components/MfaSetup';

export default function AdminMfaSetup() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/me`, { credentials: 'include' });
        if (res.status === 401) {
          navigate('/admin/login');
          return;
        }
        const data = await res.json();
        // Already set up (or not required): nothing to do here.
        if (!data.mfaEnrollmentRequired) {
          navigate('/admin/dashboard');
          return;
        }
      } catch {
        navigate('/admin/login');
        return;
      }
      if (mounted) setReady(true);
    })();
    return () => {
      mounted = false;
    };
  }, [navigate]);

  async function handleLogout() {
    await secureFetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
    navigate('/admin/login');
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-4 py-10">
      <div className="max-w-md w-full mb-4">
        <h1 className="font-serif text-2xl text-amber-700 dark:text-alux-gold mb-2">
          Set up two-factor authentication
        </h1>
        <p className="text-muted-foreground text-sm">
          Two-factor authentication is required for all admin accounts. Set it up now to continue
          to the admin area.
        </p>
      </div>
      <MfaSetup onComplete={() => navigate('/admin/dashboard')} />
      <button
        onClick={handleLogout}
        className="mt-6 text-sm text-muted-foreground underline hover:text-foreground"
      >
        Sign out
      </button>
    </div>
  );
}
