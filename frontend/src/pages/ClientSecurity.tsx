import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';
import { secureFetch } from '@/lib/security';
import ClientLayout from '@/components/ClientLayout';
import { SECTION_HEADING } from '@/lib/clientStatus';

interface Session {
  jti: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: string;
  createdAt: string;
  isCurrent: boolean;
}

interface LoginEvent {
  ipAddress: string;
  success: boolean;
  createdAt: string;
}

interface EventsPage {
  page: number;
  events: LoginEvent[];
  totalPages: number;
  total: number;
}

const PAGE_SIZE = 20;

// A short, readable label for a User-Agent string. This is a convenience for
// recognising "that's my laptop", not a parser: unknown agents fall back to
// "Unknown device" rather than showing a long raw string.
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : null;
  const os = /Windows/.test(userAgent)
    ? 'Windows'
    : /Android/.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(userAgent)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(userAgent)
          ? 'macOS'
          : /Linux/.test(userAgent)
            ? 'Linux'
            : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || 'Unknown device';
}

export default function ClientSecurity() {
  return <ClientLayout>{() => <ClientSecurityBody />}</ClientLayout>;
}

function ClientSecurityBody() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="font-serif text-xl">Account security</h1>
        <p className="text-sm text-muted-foreground">
          Where your account is signed in, and every sign-in attempt on record.
        </p>
      </div>
      <SessionsSection />
      <ActivitySection />
    </div>
  );
}

function SessionsSection() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/client/sessions`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load your sessions.');
        const data = await res.json();
        if (!mounted) return;
        setSessions(data.sessions || []);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function revoke(jti: string) {
    setActionError('');
    setRevoking(jti);
    try {
      const res = await secureFetch(`/api/client/sessions/${encodeURIComponent(jti)}/revoke`, {
        method: 'POST',
      });
      // 404 means it was already gone (expired or ended elsewhere), which is
      // the outcome the person wanted, so it is dropped from the list too.
      if (!res.ok && res.status !== 404) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Could not sign that device out.');
      }
      setSessions((prev) => (prev ? prev.filter((s) => s.jti !== jti) : prev));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not sign that device out.');
    } finally {
      setRevoking(null);
    }
  }

  return (
    <section className="mb-12">
      <h2 className={`${SECTION_HEADING} mb-1`}>Where you're signed in</h2>
      <p className="text-sm text-muted-foreground mb-4">
        If you don't recognise a device, sign it out and change your password.
      </p>

      {error && <p className="text-destructive text-sm">{error}</p>}
      {actionError && <p className="text-destructive text-sm mb-3">{actionError}</p>}
      {!error && sessions === null && (
        <p className="text-muted-foreground text-sm">Loading sessions…</p>
      )}
      {sessions && sessions.length === 0 && (
        <p className="text-muted-foreground text-sm">No active sessions.</p>
      )}

      <div className="space-y-2">
        {sessions?.map((s) => (
          <div
            key={s.jti}
            className="bg-card text-card-foreground border border-border rounded-lg px-4 py-3 flex items-center justify-between gap-4 text-sm"
          >
            <div>
              <p className="font-medium">
                {describeDevice(s.userAgent)}
                {s.isCurrent && (
                  <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-alux-green/15 dark:text-alux-green">
                    This device
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-mono">{s.ipAddress || 'unknown IP'}</span>
                {' · '}signed in {new Date(s.createdAt).toLocaleString()}
              </p>
            </div>
            {!s.isCurrent && (
              <button
                type="button"
                onClick={() => revoke(s.jti)}
                disabled={revoking === s.jti}
                className="text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors whitespace-nowrap disabled:opacity-50"
              >
                {revoking === s.jti ? 'Signing out…' : 'Sign out'}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ActivitySection() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EventsPage | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/client/security-events?page=${page}&limit=${PAGE_SIZE}`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error('Failed to load your login history.');
        const body = await res.json();
        if (!mounted) return;
        setError('');
        setData({
          page,
          events: body.events || [],
          totalPages: body.totalPages || 1,
          total: body.total || 0,
        });
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [page]);

  // `data` holds whichever page last arrived, so "loading" is simply "the page
  // on screen is not the page asked for" - no state is set from inside the
  // effect before its request starts.
  const loading = !error && (!data || data.page !== page);
  const failedOnPage = data ? data.events.filter((e) => !e.success).length : 0;

  return (
    <section>
      <h2 className={`${SECTION_HEADING} mb-1`}>Login history</h2>
      <p className="text-sm text-muted-foreground mb-4">
        The last digits of each IP address are hidden.
      </p>

      {error && <p className="text-destructive text-sm mb-3">{error}</p>}
      {loading && <p className="text-muted-foreground text-sm">Loading history…</p>}

      {data && data.page === page && (
        <>
          {failedOnPage > 0 && (
            <div className="bg-red-50 border border-red-200 dark:bg-alux-red/10 dark:border-alux-red/30 rounded-xl p-4 mb-4">
              <p className="text-red-800 dark:text-alux-red text-sm font-medium">
                {failedOnPage} failed login {failedOnPage === 1 ? 'attempt' : 'attempts'} on this
                page.
              </p>
              <p className="text-muted-foreground text-xs mt-1">
                If this wasn't you, change your password and contact Alux Plaza.
              </p>
            </div>
          )}

          {data.events.length === 0 && (
            <p className="text-muted-foreground text-sm">No login activity recorded yet.</p>
          )}

          <div className="space-y-2">
            {data.events.map((event, idx) => (
              <div
                key={idx}
                className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-2 h-2 rounded-full ${event.success ? 'bg-green-600 dark:bg-alux-green' : 'bg-red-600 dark:bg-alux-red'}`}
                    aria-hidden="true"
                  />
                  <span>{event.success ? 'Successful login' : 'Failed login attempt'}</span>
                  <span className="text-muted-foreground font-mono text-xs">{event.ipAddress}</span>
                </div>
                <span className="text-muted-foreground text-xs">
                  {new Date(event.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 text-sm">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
              >
                Newer
              </button>
              <span className="text-muted-foreground">
                Page {data.page} of {data.totalPages} · {data.total} attempts
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors disabled:opacity-40"
              >
                Older
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
