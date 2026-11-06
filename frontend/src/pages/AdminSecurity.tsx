// frontend/src/pages/AdminSecurity.tsx
// IP block management (with unblock — the one capability the dashboard's
// events table doesn't have) plus the events table for context. Migrated
// from the static admin panel's Security tab to bring feature parity to
// the React admin surface.

import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { API_BASE } from '@/lib/api';
import { secureFetch } from '@/lib/security';
import AdminLayout from '@/components/AdminLayout';
import PageControls from '@/components/PageControls';

interface BlockRow {
  ip_address: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
  blocked_at: string;
  expires_at: string | null;
  hit_count: number;
}

interface SecurityEventRow {
  id: number;
  ip_address: string;
  event_type: string;
  severity: 'low' | 'medium' | 'high';
  request_path: string | null;
  blocked: boolean;
  created_at: string;
}

const SEVERITY_STYLES: Record<string, string> = {
  high: 'bg-alux-red/15 text-alux-red',
  medium: 'bg-alux-gold/15 text-alux-gold',
  low: 'bg-white/10 text-white/50',
};

export default function AdminSecurity() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<'blocks' | 'events' | 'account'>('blocks');

  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [blocksPage, setBlocksPage] = useState(1);
  const [blocksTotalPages, setBlocksTotalPages] = useState(1);
  const [blocksLoading, setBlocksLoading] = useState(true);
  const [blocksError, setBlocksError] = useState('');

  const [events, setEvents] = useState<SecurityEventRow[]>([]);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsTotalPages, setEventsTotalPages] = useState(1);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwError, setPwError] = useState('');
  const [pwMessage, setPwMessage] = useState('');
  const [pwSubmitting, setPwSubmitting] = useState(false);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setPwError('');
    setPwMessage('');

    if (newPassword.length < 12) {
      setPwError('New password must be at least 12 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError('The new passwords do not match.');
      return;
    }

    setPwSubmitting(true);
    try {
      const res = await secureFetch('/api/admin/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to change password.');
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPwMessage(data.message || 'Password changed. Please sign in again.');
      // Every session, including this one, is invalidated by the change.
      setTimeout(() => navigate('/admin/login'), 2000);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed to change password.');
    } finally {
      setPwSubmitting(false);
    }
  }

  useEffect(() => {
    if (tab !== 'blocks') return;
    let mounted = true;
    (async () => {
      setBlocksLoading(true);
      setBlocksError('');
      try {
        const res = await fetch(
          `${API_BASE}/api/admin/security/blocks?page=${blocksPage}&limit=20`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error('Failed to load blocks.');
        const data = await res.json();
        if (!mounted) return;
        setBlocks(data.blocks);
        setBlocksTotalPages(data.totalPages || 1);
      } catch (err) {
        if (!mounted) return;
        setBlocksError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        if (mounted) setBlocksLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [tab, blocksPage]);

  useEffect(() => {
    if (tab !== 'events') return;
    let mounted = true;
    (async () => {
      setEventsLoading(true);
      setEventsError('');
      try {
        const params = new URLSearchParams({ page: String(eventsPage), limit: '20' });
        if (eventTypeFilter) params.set('type', eventTypeFilter);
        const res = await fetch(`${API_BASE}/api/admin/security/events?${params}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to load events.');
        const data = await res.json();
        if (!mounted) return;
        setEvents(data.events);
        setEventsTotalPages(data.totalPages || 1);
      } catch (err) {
        if (!mounted) return;
        setEventsError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        if (mounted) setEventsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [tab, eventsPage, eventTypeFilter]);

  async function handleUnblock(ip: string) {
    if (!confirm(`Unblock ${ip}? Only do this if you're confident it was a false positive.`))
      return;
    try {
      const res = await secureFetch(
        `/api/admin/security/blocks/${encodeURIComponent(ip)}/unblock`,
        {
          method: 'POST',
        }
      );
      if (!res.ok) throw new Error('Failed to unblock IP.');
      setBlocks((prev) => prev.filter((b) => b.ip_address !== ip));
    } catch (err) {
      setBlocksError(err instanceof Error ? err.message : 'Failed to unblock IP.');
    }
  }

  return (
    <AdminLayout>
      {() => (
        <div className="max-w-5xl mx-auto px-6 py-10">
          <h2 className="font-serif text-lg text-alux-gold mb-6">Security</h2>

          <div className="flex gap-1 mb-6 border-b border-white/10">
            {(['blocks', 'events', 'account'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-sm px-4 py-2 border-b-2 -mb-px transition-colors ${
                  tab === t
                    ? 'border-alux-cyan text-white'
                    : 'border-transparent text-white/50 hover:text-white'
                }`}
              >
                {t === 'blocks' ? 'Active Blocks' : t === 'events' ? 'Recent Events' : 'Account'}
              </button>
            ))}
          </div>

          {tab === 'blocks' && (
            <div>
              {blocksError && <p className="text-alux-red text-sm mb-4">{blocksError}</p>}
              {blocksLoading ? (
                <p className="text-white/50 text-sm">Loading…</p>
              ) : blocks.length === 0 ? (
                <p className="text-white/50 text-sm">No active blocks right now.</p>
              ) : (
                <div className="bg-navy-surface border border-white/10 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-white/40 text-xs uppercase tracking-wide">
                        <th className="px-4 py-3 font-medium">IP</th>
                        <th className="px-4 py-3 font-medium">Reason</th>
                        <th className="px-4 py-3 font-medium">Severity</th>
                        <th className="px-4 py-3 font-medium">Hits</th>
                        <th className="px-4 py-3 font-medium">Blocked</th>
                        <th className="px-4 py-3 font-medium">Expires</th>
                        <th className="px-4 py-3 font-medium"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {blocks.map((b) => (
                        <tr key={b.ip_address} className="border-b border-white/5 last:border-0">
                          <td className="px-4 py-3 font-mono text-white/70">{b.ip_address}</td>
                          <td className="px-4 py-3 text-white/60 max-w-[240px] truncate">
                            {b.reason}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${SEVERITY_STYLES[b.severity]}`}
                            >
                              {b.severity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-white/50">{b.hit_count}</td>
                          <td className="px-4 py-3 text-white/40">
                            {new Date(b.blocked_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-white/40">
                            {b.expires_at ? new Date(b.expires_at).toLocaleString() : 'Never'}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleUnblock(b.ip_address)}
                              className="text-alux-cyan text-xs border border-alux-cyan/30 rounded-lg px-2 py-1 hover:bg-alux-cyan/10 whitespace-nowrap"
                            >
                              Unblock
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <PageControls
                page={blocksPage}
                totalPages={blocksTotalPages}
                onChange={setBlocksPage}
              />
            </div>
          )}

          {tab === 'events' && (
            <div>
              <input
                type="text"
                placeholder="Filter by event type (e.g. sqli, xss, path_traversal)…"
                value={eventTypeFilter}
                onChange={(e) => {
                  setEventsPage(1);
                  setEventTypeFilter(e.target.value);
                }}
                className="w-full bg-navy-surface border border-white/15 rounded-lg px-3 py-2 text-white text-sm placeholder:text-white/30 mb-4"
              />
              {eventsError && <p className="text-alux-red text-sm mb-4">{eventsError}</p>}
              {eventsLoading ? (
                <p className="text-white/50 text-sm">Loading…</p>
              ) : events.length === 0 ? (
                <p className="text-white/50 text-sm">No matching events.</p>
              ) : (
                <div className="bg-navy-surface border border-white/10 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-white/40 text-xs uppercase tracking-wide">
                        <th className="px-4 py-3 font-medium">IP</th>
                        <th className="px-4 py-3 font-medium">Type</th>
                        <th className="px-4 py-3 font-medium">Severity</th>
                        <th className="px-4 py-3 font-medium">Path</th>
                        <th className="px-4 py-3 font-medium">Blocked</th>
                        <th className="px-4 py-3 font-medium">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((e) => (
                        <tr key={e.id} className="border-b border-white/5 last:border-0">
                          <td className="px-4 py-3 font-mono text-white/70">{e.ip_address}</td>
                          <td className="px-4 py-3">{e.event_type}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${SEVERITY_STYLES[e.severity]}`}
                            >
                              {e.severity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-white/50 font-mono text-xs truncate max-w-[200px]">
                            {e.request_path || '—'}
                          </td>
                          <td className="px-4 py-3">
                            {e.blocked ? (
                              <span className="text-alux-red text-xs">Blocked</span>
                            ) : (
                              <span className="text-white/30 text-xs">Logged only</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-white/40">
                            {new Date(e.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <PageControls
                page={eventsPage}
                totalPages={eventsTotalPages}
                onChange={setEventsPage}
              />
            </div>
          )}

          {tab === 'account' && (
            <form onSubmit={handleChangePassword} className="max-w-md space-y-4">
              <p className="text-white/50 text-sm">
                Accounts are created with a temporary password chosen by the person who created
                them. Set your own here. Changing it signs you out of every session.
              </p>
              <div>
                <label
                  htmlFor="current-password"
                  className="block text-sm text-white/60 mb-1"
                >
                  Current password
                </label>
                <input
                  id="current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-navy-surface border border-white/15 rounded-lg px-3 py-2 text-white text-sm"
                  required
                />
              </div>
              <div>
                <label htmlFor="new-password" className="block text-sm text-white/60 mb-1">
                  New password (at least 12 characters)
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-navy-surface border border-white/15 rounded-lg px-3 py-2 text-white text-sm"
                  required
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-sm text-white/60 mb-1">
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-navy-surface border border-white/15 rounded-lg px-3 py-2 text-white text-sm"
                  required
                />
              </div>

              {pwError && <p className="text-alux-red text-sm">{pwError}</p>}
              {pwMessage && <p className="text-alux-cyan text-sm">{pwMessage}</p>}

              <button
                type="submit"
                disabled={pwSubmitting}
                className="bg-alux-cyan/10 border border-alux-cyan/30 text-alux-cyan rounded-lg px-4 py-2 text-sm hover:bg-alux-cyan/20 disabled:opacity-50"
              >
                {pwSubmitting ? 'Changing…' : 'Change password'}
              </button>
            </form>
          )}
        </div>
      )}
    </AdminLayout>
  );
}
