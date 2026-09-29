// frontend/src/pages/ClientSecurityPage.tsx
// Login-attempt history for the signed-in client, with pagination.
// Data comes from GET /api/client/security-events (IPs are already
// masked server-side before they reach this page).

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';
import ClientLayout, { type ClientInfo } from '@/components/ClientLayout';

interface LoginEvent {
  ipAddress: string;
  success: boolean;
  createdAt: string;
}

interface SecurityData {
  events: LoginEvent[];
  failedCount: number;
  total: number;
  page: number;
  totalPages: number;
}

const PAGE_SIZE = 20;

export default function ClientSecurityPage() {
  return (
    <ClientLayout title="Security">
      {(client) => <ClientSecurityBody client={client} />}
    </ClientLayout>
  );
}

function ClientSecurityBody({ client: _client }: { client: ClientInfo }) {
  const [data, setData] = useState<SecurityData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/api/client/security-events?page=${page}&limit=${PAGE_SIZE}`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error('Failed to load security events.');
        const json = await res.json();
        setData({
          events: json.events || [],
          failedCount: json.failedCount || 0,
          total: json.total || 0,
          page: json.page || 1,
          totalPages: json.totalPages || 1,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setLoading(false);
      }
    })();
  }, [page]);

  if (loading && !data) {
    return (
      <div className="px-6 py-10 flex items-center gap-3 text-white/40">
        <div className="w-5 h-5 border-2 border-alux-gold/30 border-t-alux-gold rounded-full animate-spin" />
        Loading security events…
      </div>
    );
  }

  if (error) return <p className="text-alux-red px-6 py-10">{error}</p>;
  if (!data) return null;

  const { events, failedCount, page: currentPage, totalPages } = data;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Failed-login banner */}
      {failedCount > 0 && (
        <div className="bg-alux-red/10 border border-alux-red/30 rounded-xl p-4 mb-6 flex items-start gap-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 text-alux-red shrink-0 mt-0.5">
            <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
          </svg>
          <div>
            <p className="text-alux-red text-sm font-medium">
              {failedCount} failed login {failedCount === 1 ? 'attempt' : 'attempts'} on this page
              of your history.
            </p>
            <p className="text-white/50 text-xs mt-1">
              If this wasn't you, change your password and contact Alux Plaza immediately.
            </p>
          </div>
        </div>
      )}

      {/* Events table */}
      <div className="bg-navy-surface border border-white/10 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <h3 className="font-serif text-alux-gold">Login History</h3>
          <span className="text-xs text-white/30 font-mono">{data.total} events</span>
        </div>

        {events.length === 0 ? (
          <p className="px-5 py-10 text-center text-white/40 text-sm">No login activity recorded yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {events.map((event, idx) => (
              <li key={idx} className="px-5 py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      event.success ? 'bg-alux-green' : 'bg-alux-red'
                    }`}
                  />
                  <span className="text-sm text-white/80 truncate">
                    {event.success ? 'Successful login' : 'Failed attempt'}
                  </span>
                  <span className="text-white/25 font-mono text-xs hidden sm:inline">
                    {event.ipAddress}
                  </span>
                </div>
                <span className="text-white/40 text-xs whitespace-nowrap font-mono">
                  {new Date(event.createdAt).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="text-xs text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Previous
            </button>
            <span className="text-xs text-white/30 font-mono">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="text-xs text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
