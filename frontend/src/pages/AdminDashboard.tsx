// frontend/src/pages/AdminDashboard.tsx
// Landing page after admin login. Three sections: platform-wide compliance
// overview, a paginated client list (with risk scores), and a paginated
// security events table.

import { useEffect, useState } from 'react';
import { API_BASE } from '@/lib/api';
import AdminLayout from '@/components/AdminLayout';
import PageControls from '@/components/PageControls';

interface ComplianceOverview {
  totalClients: number;
  avgScore: number | null;
  bandCounts: Record<string, number>;
}

interface ClientRow {
  id: number;
  company_name: string;
  email: string;
  created_at: string;
  score: number | null;
  itemCount: number;
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

const BAND_STYLES: Record<string, string> = {
  Strong: 'bg-green-100 text-green-800 dark:bg-alux-green/15 dark:text-alux-green',
  Adequate: 'bg-cyan-100 text-cyan-800 dark:bg-alux-cyan/15 dark:text-alux-cyan',
  Developing: 'bg-amber-100 text-amber-800 dark:bg-alux-gold/15 dark:text-alux-gold',
  'Needs attention': 'bg-red-100 text-red-800 dark:bg-alux-red/15 dark:text-alux-red',
  'Not yet assessed': 'bg-muted text-muted-foreground',
};

const BAND_TEXT_STYLES: Record<string, string> = {
  Strong: 'text-green-800 dark:text-alux-green',
  Adequate: 'text-cyan-800 dark:text-alux-cyan',
  Developing: 'text-amber-800 dark:text-alux-gold',
  'Needs attention': 'text-red-800 dark:text-alux-red',
  'Not yet assessed': 'text-muted-foreground',
};

const SEVERITY_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-800 dark:bg-alux-red/15 dark:text-alux-red',
  medium: 'bg-amber-100 text-amber-800 dark:bg-alux-gold/15 dark:text-alux-gold',
  low: 'bg-muted text-muted-foreground',
};

export default function AdminDashboard() {
  const [overview, setOverview] = useState<ComplianceOverview | null>(null);
  const [overviewError, setOverviewError] = useState('');

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [clientsPage, setClientsPage] = useState(1);
  const [clientsTotalPages, setClientsTotalPages] = useState(1);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [clientsError, setClientsError] = useState('');

  const [events, setEvents] = useState<SecurityEventRow[]>([]);
  const [eventsPage, setEventsPage] = useState(1);
  const [eventsTotalPages, setEventsTotalPages] = useState(1);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/compliance-overview`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Failed to load compliance overview.');
        setOverview(await res.json());
      } catch (err) {
        setOverviewError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    })();
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setClientsLoading(true);
      setClientsError('');
      try {
        const res = await fetch(
          `${API_BASE}/api/admin/clients?page=${clientsPage}&limit=10&includeScore=true`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error('Failed to load clients.');
        const data = await res.json();
        if (!mounted) return;
        setClients(data.clients);
        setClientsTotalPages(data.totalPages || 1);
      } catch (err) {
        if (!mounted) return;
        setClientsError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        if (mounted) setClientsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [clientsPage]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setEventsLoading(true);
      setEventsError('');
      try {
        const res = await fetch(
          `${API_BASE}/api/admin/security/events?page=${eventsPage}&limit=10`,
          { credentials: 'include' }
        );
        if (!res.ok) throw new Error('Failed to load security events.');
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
  }, [eventsPage]);

  return (
    <AdminLayout>
      {() => (
        <div className="max-w-6xl mx-auto px-6 py-10 space-y-12">
          {/* Compliance overview */}
          <section>
            <h2 className="font-serif text-lg text-alux-gold mb-4">Compliance Overview</h2>
            {overviewError && <p className="text-destructive text-sm">{overviewError}</p>}
            {overview && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total clients</p>
                  <p className="text-2xl font-bold font-mono">{overview.totalClients}</p>
                </div>
                <div className="bg-card border border-border rounded-xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Average score</p>
                  <p className="text-2xl font-bold font-mono">
                    {overview.avgScore !== null ? overview.avgScore : '—'}
                  </p>
                </div>
                {Object.entries(overview.bandCounts).map(([band, count]) => (
                  <div key={band} className="bg-card border border-border rounded-xl p-4">
                    <p className="text-xs text-muted-foreground mb-1">{band}</p>
                    <p className={`text-2xl font-bold font-mono ${BAND_TEXT_STYLES[band] || ''}`}>
                      {count}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Client list */}
          <section>
            <h2 className="font-serif text-lg text-alux-gold mb-4">Clients</h2>
            {clientsError && <p className="text-destructive text-sm mb-3">{clientsError}</p>}
            {clientsLoading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : clients.length === 0 ? (
              <p className="text-muted-foreground text-sm">No clients yet.</p>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground text-xs uppercase tracking-wide">
                      <th className="px-4 py-3 font-medium">Company</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Score</th>
                      <th className="px-4 py-3 font-medium">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clients.map((c) => {
                      const band =
                        c.score === null
                          ? 'Not yet assessed'
                          : c.score >= 90
                            ? 'Strong'
                            : c.score >= 70
                              ? 'Adequate'
                              : c.score >= 50
                                ? 'Developing'
                                : 'Needs attention';
                      return (
                        <tr key={c.id} className="border-b border-border/50 last:border-0">
                          <td className="px-4 py-3 font-medium">{c.company_name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${BAND_STYLES[band]}`}
                            >
                              {c.score !== null ? `${c.score} · ${band}` : band}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(c.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <PageControls
              page={clientsPage}
              totalPages={clientsTotalPages}
              onChange={setClientsPage}
            />
          </section>

          {/* Security events */}
          <section>
            <h2 className="font-serif text-lg text-alux-gold mb-4">Recent Security Events</h2>
            {eventsError && <p className="text-destructive text-sm mb-3">{eventsError}</p>}
            {eventsLoading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : events.length === 0 ? (
              <p className="text-muted-foreground text-sm">No security events recorded.</p>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground text-xs uppercase tracking-wide">
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
                      <tr key={e.id} className="border-b border-border/50 last:border-0">
                        <td className="px-4 py-3 font-mono text-foreground/80">{e.ip_address}</td>
                        <td className="px-4 py-3">{e.event_type}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${SEVERITY_STYLES[e.severity]}`}
                          >
                            {e.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs truncate max-w-[200px]">
                          {e.request_path || '—'}
                        </td>
                        <td className="px-4 py-3">
                          {e.blocked ? (
                            <span className="text-destructive text-xs">Blocked</span>
                          ) : (
                            <span className="text-muted-foreground/70 text-xs">Logged only</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
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
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
