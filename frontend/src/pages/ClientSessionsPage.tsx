// frontend/src/pages/ClientSessionsPage.tsx
// Active session management for the signed-in client.
// Lists every live session from GET /api/client/sessions and lets the
// client revoke any of them except the current one (the backend rejects
// revoking your own session with a 400 — use Logout for that).

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { secureFetch } from '@/lib/security';
import ClientLayout, { type ClientInfo } from '@/components/ClientLayout';

interface Session {
  jti: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: string;
  createdAt: string;
  isCurrent: boolean;
}

function shortAgent(ua: string): string {
  if (!ua) return 'Unknown device';
  if (/mobile|android|iphone/i.test(ua)) return 'Mobile device';
  if (/edg\//i.test(ua)) return 'Microsoft Edge';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/chrome/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Browser';
}

function osOf(ua: string): string {
  if (/windows/i.test(ua)) return 'Windows';
  if (/mac os|macintosh/i.test(ua)) return 'macOS';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ios/i.test(ua)) return 'iOS';
  if (/linux/i.test(ua)) return 'Linux';
  return '';
}

export default function ClientSessionsPage() {
  return (
    <ClientLayout title="Sessions">
      {(client) => <ClientSessionsBody client={client} />}
    </ClientLayout>
  );
}

function ClientSessionsBody({ client: _client }: { client: ClientInfo }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/client/sessions`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load sessions.');
        const data = await res.json();
        setSessions(data.sessions || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function revoke(jti: string) {
    setRevoking(jti);
    setMessage('');
    try {
      const res = await secureFetch(`/api/client/sessions/${jti}/revoke`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to revoke session.');
      }
      setSessions((prev) => prev.filter((s) => s.jti !== jti));
      setMessage('Session revoked.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setRevoking(null);
    }
  }

  if (loading) {
    return (
      <div className="px-6 py-10 flex items-center gap-3 text-white/40">
        <div className="w-5 h-5 border-2 border-alux-gold/30 border-t-alux-gold rounded-full animate-spin" />
        Loading sessions…
      </div>
    );
  }

  if (error) return <p className="text-alux-red px-6 py-10">{error}</p>;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      {message && (
        <div className="bg-alux-green/10 border border-alux-green/30 rounded-xl px-4 py-3 mb-6">
          <p className="text-alux-green text-sm">{message}</p>
        </div>
      )}

      <p className="text-sm text-white/50 mb-6">
        These are the devices currently signed in to your account. Revoke any session you don't
        recognize.
      </p>

      {sessions.length === 0 ? (
        <p className="text-white/40 text-sm">No active sessions.</p>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => {
            const browser = shortAgent(s.userAgent);
            const os = osOf(s.userAgent);
            return (
              <div
                key={s.jti}
                className={`bg-navy-surface border rounded-xl p-4 flex items-center justify-between gap-4 ${
                  s.isCurrent ? 'border-alux-gold/30' : 'border-white/10'
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-5 h-5 text-white/40">
                      <rect x="3" y="4" width="18" height="12" rx="2" />
                      <path d="M8 20h8M12 16v4" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium flex items-center gap-2">
                      {browser}
                      {os && <span className="text-white/40 font-normal">· {os}</span>}
                      {s.isCurrent && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider bg-alux-gold/15 text-alux-gold px-2 py-0.5 rounded-full">
                          This device
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-white/40 mt-0.5 font-mono">
                      {s.ipAddress} · started {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {!s.isCurrent && (
                  <button
                    onClick={() => revoke(s.jti)}
                    disabled={revoking === s.jti}
                    className="text-xs font-medium text-alux-red border border-alux-red/30 rounded-lg px-3.5 py-1.5 hover:bg-alux-red/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    {revoking === s.jti ? 'Revoking…' : 'Revoke'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
