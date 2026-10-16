import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { API_BASE } from '@/lib/api';
import ClientLayout, { type ClientInfo } from '@/components/ClientLayout';
import { GOLD_TEXT, SECTION_HEADING, styleFor, type ComplianceItem } from '@/lib/clientStatus';

interface LoginEvent {
  ipAddress: string;
  success: boolean;
  createdAt: string;
}

// How many recent sign-in attempts to look at when deciding whether to show
// the failed-attempt warning. The full history lives on /client/security.
const ACTIVITY_WINDOW = 20;
const ACTIVITY_SHOWN = 5;

export default function ClientDashboard() {
  // Auth-gating, the header and logout live in ClientLayout. The render prop is
  // what sequences the work: this component's effect below is scoped to the
  // body, so the compliance/risk/security requests are not issued until
  // ClientLayout has resolved /api/client/me. Keeping them in this component
  // instead would fire all of them in parallel with it and produce a 401 (and a
  // spurious "Failed to load compliance status") on every unauthenticated visit.
  return <ClientLayout>{(client) => <ClientDashboardBody client={client} />}</ClientLayout>;
}

function ClientDashboardBody({ client }: { client: ClientInfo }) {
  const [frameworks, setFrameworks] = useState<Record<string, ComplianceItem[]>>({});
  const [score, setScore] = useState<{ score: number | null; label: string } | null>(null);
  const [loginEvents, setLoginEvents] = useState<LoginEvent[]>([]);
  const [failedLoginCount, setFailedLoginCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function loadDashboard() {
      try {
        const opts = { credentials: 'include' as const };
        const [complianceRes, scoreRes, securityRes] = await Promise.all([
          fetch(`${API_BASE}/api/client/compliance`, opts),
          fetch(`${API_BASE}/api/client/risk-score`, opts),
          fetch(`${API_BASE}/api/client/security-events?limit=${ACTIVITY_WINDOW}`, opts),
        ]);

        // Compliance is the page's main content, so its failure is an error.
        // The score and activity panels are secondary: if they fail, the rest
        // of the page still renders without them.
        if (!complianceRes.ok) throw new Error('Failed to load compliance status.');
        const complianceData = await complianceRes.json();
        const scoreData = scoreRes.ok ? await scoreRes.json() : null;
        const securityData = securityRes.ok ? await securityRes.json() : null;
        if (!mounted) return;

        setFrameworks(complianceData.frameworks || {});
        if (scoreData) setScore({ score: scoreData.score, label: scoreData.label });
        if (securityData) {
          setLoginEvents(securityData.events || []);
          setFailedLoginCount(securityData.failedCount || 0);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadDashboard();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <p className="text-muted-foreground px-6 py-10">Loading your compliance status…</p>;
  }

  if (error) {
    return <p className="text-destructive px-6 py-10">{error}</p>;
  }

  const frameworkNames = Object.keys(frameworks);
  const allItems = frameworkNames.flatMap((f) => frameworks[f]);
  const countOf = (status: string) => allItems.filter((i) => i.status === status).length;
  const passingCount = countOf('passing');
  const failingItems = allItems.filter((i) => i.status === 'failing');

  const tiles = [
    { status: 'passing', label: 'Passing' },
    { status: 'in_progress', label: 'In progress' },
    { status: 'failing', label: 'Needs attention' },
    { status: 'pending', label: 'Not yet assessed' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className={`font-serif text-xl ${GOLD_TEXT}`}>{client.company_name}</h1>
        <p className="text-sm text-muted-foreground">Compliance and account activity</p>
      </div>

      {score && score.score !== null && (
        <div className="bg-card text-card-foreground border border-amber-700/30 dark:border-alux-gold/20 rounded-2xl p-6 mb-6 flex items-center justify-between gap-6">
          <div>
            <p className="text-muted-foreground text-sm mb-1">Your Risk Score</p>
            <p className="text-3xl font-bold font-mono">
              {score.score}
              <span className="text-muted-foreground text-lg">/100</span>
            </p>
            <p className={`text-sm mt-1 ${GOLD_TEXT}`}>{score.label}</p>
          </div>
          <p className="text-xs text-muted-foreground max-w-[180px] text-right">
            Ask your admin for a shareable verification link to send to banks or partners.
          </p>
        </div>
      )}

      {allItems.length === 0 ? (
        <p className="text-muted-foreground mb-10">No compliance items on file yet.</p>
      ) : (
        <>
          <p className="text-muted-foreground mb-4">
            {passingCount} of {allItems.length} checklist items currently passing.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10">
            {tiles.map((tile) => (
              <div key={tile.status} className="bg-card border border-border rounded-xl p-4">
                <p className="text-2xl font-bold font-mono">{countOf(tile.status)}</p>
                <span
                  className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full mt-2 ${styleFor(tile.status).className}`}
                >
                  {tile.label}
                </span>
              </div>
            ))}
          </div>

          <div className="mb-10">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className={SECTION_HEADING}>Frameworks</h2>
              <Link
                to="/client/compliance"
                className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
              >
                View full checklist
              </Link>
            </div>
            <div className="space-y-3">
              {frameworkNames.map((framework) => {
                const items = frameworks[framework];
                const applicable = items.filter((i) => i.status !== 'not_applicable');
                const passing = applicable.filter((i) => i.status === 'passing').length;
                const pct = applicable.length ? Math.round((passing / applicable.length) * 100) : 0;
                return (
                  <div key={framework} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="font-medium">{framework}</span>
                      <span className="text-muted-foreground">
                        {applicable.length === 0
                          ? 'Nothing applicable'
                          : `${passing} of ${applicable.length} passing`}
                      </span>
                    </div>
                    <div
                      className="h-2 rounded-full bg-muted overflow-hidden"
                      role="progressbar"
                      aria-label={`${framework} passing`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                    >
                      <div
                        className="h-full bg-green-600 dark:bg-alux-green"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {failingItems.length > 0 && (
        <div className="mb-10">
          <h2 className={`${SECTION_HEADING} mb-4`}>Needs attention</h2>
          <div className="space-y-2">
            {failingItems.slice(0, 3).map((item) => (
              <div
                key={item.id}
                className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between gap-4 text-sm"
              >
                <div>
                  <p className="font-medium">{item.title}</p>
                  <p className="text-xs text-muted-foreground">{item.framework}</p>
                </div>
                <span
                  className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ${styleFor(item.status).className}`}
                >
                  {styleFor(item.status).label}
                </span>
              </div>
            ))}
            {failingItems.length > 3 && (
              <Link
                to="/client/compliance"
                className="inline-block text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
              >
                and {failingItems.length - 3} more
              </Link>
            )}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className={SECTION_HEADING}>Account Login Activity</h2>
          <Link
            to="/client/security"
            className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4"
          >
            Sessions and full history
          </Link>
        </div>
        {failedLoginCount > 0 && (
          <div className="bg-red-50 border border-red-200 dark:bg-alux-red/10 dark:border-alux-red/30 rounded-xl p-4 mb-4">
            <p className="text-red-800 dark:text-alux-red text-sm font-medium">
              {failedLoginCount} failed login {failedLoginCount === 1 ? 'attempt' : 'attempts'} on
              your account recently.
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              If this wasn't you, consider changing your password and contacting Alux Plaza.
            </p>
          </div>
        )}
        <div className="space-y-2">
          {loginEvents.length === 0 && (
            <p className="text-muted-foreground text-sm">No login activity recorded yet.</p>
          )}
          {loginEvents.slice(0, ACTIVITY_SHOWN).map((event, idx) => (
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
      </div>
    </div>
  );
}
