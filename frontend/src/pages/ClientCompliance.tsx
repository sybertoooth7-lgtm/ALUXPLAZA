import { useEffect, useMemo, useState } from 'react';
import { API_BASE } from '@/lib/api';
import ClientLayout from '@/components/ClientLayout';
import {
  SECTION_HEADING,
  styleFor,
  STATUS_STYLES,
  type ComplianceItem,
  type ComplianceStatus,
} from '@/lib/clientStatus';

type Filter = 'all' | ComplianceStatus;

// Worst-first, so the filter chips lead with what needs doing.
const FILTER_ORDER: ComplianceStatus[] = [
  'failing',
  'in_progress',
  'pending',
  'passing',
  'not_applicable',
];

export default function ClientCompliance() {
  // The body's fetch only starts once ClientLayout has confirmed the session,
  // for the same reason as ClientDashboard.
  return <ClientLayout>{() => <ClientComplianceBody />}</ClientLayout>;
}

function ClientComplianceBody() {
  const [frameworks, setFrameworks] = useState<Record<string, ComplianceItem[]>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/client/compliance`, { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load compliance status.');
        const data = await res.json();
        if (!mounted) return;
        setFrameworks(data.frameworks || {});
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
  }, []);

  const allItems = useMemo(() => Object.values(frameworks).flat(), [frameworks]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const item of allItems) c[item.status] = (c[item.status] || 0) + 1;
    return c;
  }, [allItems]);

  if (loading) {
    return <p className="text-muted-foreground px-6 py-10">Loading your checklist…</p>;
  }
  if (error) {
    return <p className="text-destructive px-6 py-10">{error}</p>;
  }

  const frameworkNames = Object.keys(frameworks);
  const visibleFrameworks = frameworkNames
    .map((name) => ({
      name,
      total: frameworks[name].length,
      items: frameworks[name].filter((i) => filter === 'all' || i.status === filter),
    }))
    .filter((f) => f.items.length > 0);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="font-serif text-xl">Compliance checklist</h1>
        <p className="text-sm text-muted-foreground">
          Every item Alux Plaza tracks for you, with its current status and any notes.
        </p>
      </div>

      {allItems.length === 0 ? (
        <p className="text-muted-foreground">No compliance items on file yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mb-8" role="group" aria-label="Filter by status">
            <FilterChip
              active={filter === 'all'}
              onClick={() => setFilter('all')}
              label={`All (${allItems.length})`}
            />
            {FILTER_ORDER.filter((s) => counts[s]).map((s) => (
              <FilterChip
                key={s}
                active={filter === s}
                onClick={() => setFilter(s)}
                label={`${STATUS_STYLES[s].label} (${counts[s]})`}
              />
            ))}
          </div>

          {visibleFrameworks.length === 0 && (
            <p className="text-muted-foreground text-sm">No items match this filter.</p>
          )}

          {visibleFrameworks.map(({ name, items, total }) => (
            <section key={name} className="mb-10">
              <h2 className={`${SECTION_HEADING} mb-4`}>
                {name}
                <span className="ml-2 text-sm font-sans text-muted-foreground">
                  {items.length === total ? `${total} items` : `${items.length} of ${total} items`}
                </span>
              </h2>
              <div className="space-y-3">
                {items.map((item) => {
                  const style = styleFor(item.status);
                  return (
                    <div
                      key={item.id}
                      className="bg-card text-card-foreground border border-border rounded-xl p-4 flex items-start justify-between gap-4"
                    >
                      <div>
                        <p className="font-medium">{item.title}</p>
                        {item.description && (
                          <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                        )}
                        {item.notes && (
                          <p className="text-sm text-muted-foreground mt-2 italic">
                            Note: {item.notes}
                          </p>
                        )}
                        {item.updated_at && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Updated {new Date(item.updated_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <span
                        className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ${style.className}`}
                      >
                        {style.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
        active
          ? 'bg-secondary text-foreground border-foreground/30'
          : 'text-muted-foreground border-border hover:text-foreground hover:bg-secondary/50'
      }`}
    >
      {label}
    </button>
  );
}
