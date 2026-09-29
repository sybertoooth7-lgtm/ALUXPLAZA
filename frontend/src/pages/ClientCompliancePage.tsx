// frontend/src/pages/ClientCompliancePage.tsx
// Full compliance checklist across every framework the platform tracks.
// Data comes from GET /api/client/compliance, grouped by framework, with
// per-item status badges and an overall progress summary at the top.

import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api';
import ClientLayout, { type ClientInfo } from '@/components/ClientLayout';

interface ComplianceItem {
  id: number;
  framework: string;
  item_key: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'passing' | 'failing' | 'not_applicable';
  notes: string | null;
  updated_at: string | null;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  pending: { label: 'Not yet assessed', className: 'bg-white/10 text-white/50' },
  in_progress: { label: 'In progress', className: 'bg-alux-cyan/15 text-alux-cyan' },
  passing: { label: 'Passing', className: 'bg-alux-green/15 text-alux-green' },
  failing: { label: 'Needs attention', className: 'bg-alux-red/15 text-alux-red' },
  not_applicable: { label: 'Not applicable', className: 'bg-white/5 text-white/30' },
};

const STATUS_ORDER = ['failing', 'in_progress', 'pending', 'passing', 'not_applicable'];

export default function ClientCompliancePage() {
  return (
    <ClientLayout title="Compliance">
      {(client) => <ClientComplianceBody client={client} />}
    </ClientLayout>
  );
}

function ClientComplianceBody({ client: _client }: { client: ClientInfo }) {
  const [frameworks, setFrameworks] = useState<Record<string, ComplianceItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/client/compliance`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load compliance status.');
        const data = await res.json();
        setFrameworks(data.frameworks || {});
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const frameworkNames = Object.keys(frameworks);
  const allItems = useMemo(() => frameworkNames.flatMap((f) => frameworks[f]), [frameworks]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { passing: 0, failing: 0, in_progress: 0, pending: 0, not_applicable: 0 };
    for (const item of allItems) c[item.status] = (c[item.status] || 0) + 1;
    return c;
  }, [allItems]);

  const assessed = counts.passing + counts.failing + counts.in_progress;
  const pct = allItems.length ? Math.round((counts.passing / allItems.length) * 100) : 0;

  const visibleFrameworks = useMemo(() => {
    if (filter === 'all') return frameworks;
    const out: Record<string, ComplianceItem[]> = {};
    for (const [fw, items] of Object.entries(frameworks)) {
      const filtered = items.filter((i) => i.status === filter);
      if (filtered.length) out[fw] = filtered;
    }
    return out;
  }, [frameworks, filter]);

  if (loading) {
    return (
      <div className="px-6 py-10 flex items-center gap-3 text-white/40">
        <div className="w-5 h-5 border-2 border-alux-gold/30 border-t-alux-gold rounded-full animate-spin" />
        Loading compliance data…
      </div>
    );
  }

  if (error) return <p className="text-alux-red px-6 py-10">{error}</p>;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Summary */}
      <div className="bg-navy-surface border border-white/10 rounded-2xl p-6 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          {/* Score ring */}
          <div className="relative w-28 h-28 shrink-0 mx-auto sm:mx-0">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="42" fill="none"
                stroke="#c9a84c" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * 264} 264`}
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold font-mono">{pct}%</span>
              <span className="text-[10px] text-white/40 uppercase tracking-wider">passing</span>
            </div>
          </div>

          <div className="flex-1 text-center sm:text-left">
            <h3 className="font-serif text-lg text-alux-gold mb-1">Compliance Overview</h3>
            <p className="text-sm text-white/50">
              {counts.passing} of {allItems.length} items passing
              {assessed < allItems.length && ` · ${allItems.length - assessed} not yet assessed`}
            </p>
            <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-4">
              {STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilter(filter === s ? 'all' : s)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                    filter === s ? 'ring-2 ring-white/30 ' : ''
                  }${STATUS_STYLES[s].className}`}
                >
                  {STATUS_STYLES[s].label} · {counts[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Frameworks */}
      {frameworkNames.length === 0 && (
        <p className="text-white/50">No compliance items on file yet.</p>
      )}

      {Object.entries(visibleFrameworks).map(([framework, items]) => (
        <section key={framework} className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="font-serif text-lg text-alux-cyan">{framework}</h2>
            <span className="text-xs text-white/30 font-mono">{items.length} items</span>
            <div className="flex-1 h-px bg-white/5" />
          </div>
          <div className="space-y-2.5">
            {items.map((item) => {
              const style = STATUS_STYLES[item.status] || STATUS_STYLES.pending;
              return (
                <div
                  key={item.id}
                  className="bg-navy-surface border border-white/10 rounded-xl p-4 flex items-start justify-between gap-4 hover:border-white/20 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm sm:text-base">{item.title}</p>
                    {item.description && (
                      <p className="text-sm text-white/50 mt-1">{item.description}</p>
                    )}
                    {item.notes && (
                      <p className="text-sm text-white/40 mt-2 italic border-l-2 border-alux-gold/30 pl-3">
                        {item.notes}
                      </p>
                    )}
                    {item.updated_at && (
                      <p className="text-[11px] text-white/25 mt-2 font-mono">
                        Updated {new Date(item.updated_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap shrink-0 ${style.className}`}
                  >
                    {style.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
