import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Activity, Timer, Gauge, ShieldCheck, TrendingUp, Ban } from 'lucide-react';
import { API_BASE } from '@/lib/api';

gsap.registerPlugin(ScrollTrigger);

// Cumulative counters and uptime are not worth 8s freshness on a 0.1-CPU
// instance; 15s keeps the section feeling live at a third less request load.
const POLL_INTERVAL_MS = 15_000;
const MAX_BACKOFF_MS = 5 * 60_000;

interface StatusResponse {
  requestCount: number;
  errorCount: number;
  averageLatencyMs: number | null;
  requestsPerSecond: number;
  uptimeSeconds: number;
  contactSuccessRate: number | null;
  honeypotBlocked: number;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function DefenseMatrix() {
  const sectionRef = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inFlight = false;
    let backoffMs = POLL_INTERVAL_MS;

    async function fetchStatus() {
      inFlight = true;
      try {
        const res = await fetch(`${API_BASE}/api/status/defense-matrix`);
        if (!res.ok) throw new Error('Status endpoint unavailable');
        const data: StatusResponse = await res.json();
        if (cancelled) return;
        setStatus(data);
        setIsLive(true);
        backoffMs = POLL_INTERVAL_MS;
      } catch {
        if (!cancelled) setIsLive(false);
        // Back off while the endpoint is unhealthy instead of retrying on a
        // fixed interval, so a struggling backend isn't kept busy by clients.
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
      } finally {
        // Recursive setTimeout rather than setInterval: a fetch slower than the
        // interval would otherwise have requests pile up concurrently. Paused
        // while hidden, since a backgrounded tab still runs timers and would
        // otherwise poll with nobody watching.
        inFlight = false;
        if (!cancelled && !document.hidden) {
          timer = setTimeout(fetchStatus, backoffMs);
        }
      }
    }

    // Resume promptly on tab focus so the metrics don't sit stale up to a full
    // backoff interval after the user comes back.
    function onVisibilityChange() {
      if (cancelled) return;
      if (document.hidden) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        return;
      }
      if (!timer && !inFlight) {
        backoffMs = POLL_INTERVAL_MS;
        fetchStatus();
      }
    }

    fetchStatus();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!sectionRef.current) return;
    const cards = sectionRef.current.querySelectorAll('.defense-card');
    gsap.fromTo(
      cards,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: 'power3.out',
        stagger: 0.1,
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top 60%',
          once: true,
        },
      }
    );
  }, []);

  const metrics = [
    {
      id: 'uptime',
      name: 'Backend Uptime',
      color: '#00d4ff',
      icon: Timer,
      value: isLive && status ? formatUptime(status.uptimeSeconds) : '—',
      description: 'How long the production backend has been running without restarting.',
    },
    {
      id: 'requests',
      name: 'Requests Handled',
      color: '#a855f7',
      icon: Activity,
      value: isLive && status ? status.requestCount.toLocaleString() : '—',
      description: 'Total requests served since deployment, read straight from the database.',
    },
    {
      id: 'latency',
      name: 'Average Latency',
      color: '#c9a84c',
      icon: Gauge,
      value:
        isLive && status
          ? status.averageLatencyMs !== null
            ? `${status.averageLatencyMs.toFixed(0)}ms`
            : 'Warming up'
          : '—',
      description: 'Response time over recent requests to this backend instance.',
    },
    {
      id: 'errors',
      name: 'Error Rate',
      color: '#00ff88',
      icon: ShieldCheck,
      value:
        isLive && status
          ? `${status.requestCount > 0 ? ((status.errorCount / status.requestCount) * 100).toFixed(2) : '0.00'}%`
          : '—',
      description: 'Share of requests that resulted in a server error, not a client mistake.',
    },
    {
      id: 'contact-rate',
      name: 'Contact Form Success',
      color: '#f97316',
      icon: TrendingUp,
      value:
        isLive && status && status.contactSuccessRate !== null
          ? `${status.contactSuccessRate.toFixed(0)}%`
          : isLive
            ? 'No submissions yet'
            : '—',
      description: 'Share of contact form attempts that saved successfully.',
    },
    {
      id: 'honeypot',
      name: 'Bots Blocked',
      color: '#ff3366',
      icon: Ban,
      value: isLive && status ? status.honeypotBlocked.toLocaleString() : '—',
      description: 'Submissions caught by the hidden honeypot field on the contact form.',
    },
  ];

  return (
    <section
      ref={sectionRef}
      id="ai-defense"
      className="py-24 md:py-32 bg-navy-surface hex-grid relative"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header */}
        <div className="text-center mb-16 reveal">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-alux-red/10 border border-alux-red/20 text-alux-red text-sm font-medium mb-4">
            <span
              className={`w-2 h-2 rounded-full mr-2 ${isLive ? 'bg-alux-green animate-ping' : 'bg-alux-red animate-ping'}`}
            />
            {isLive ? 'Live — Connected to Backend' : 'Backend Unreachable'}
          </div>
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-white mb-6">
            Live <span className="gradient-text-cyan">System Status</span>
          </h2>
          <p className="text-[#94a3b8] text-lg max-w-2xl mx-auto">
            These numbers come straight from our production backend, refreshed every 8 seconds — not
            a mockup. This is the same infrastructure we run for client work.
          </p>
        </div>

        {/* Metrics Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {metrics.map((metric) => (
            <div
              key={metric.id}
              className="defense-card bg-navy-surface border rounded-2xl p-7 transition-all duration-300 hover:-translate-y-1"
              style={{ borderColor: 'rgba(255,255,255,0.06)' }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = `${metric.color}4D`;
                (e.currentTarget as HTMLElement).style.boxShadow = `0 8px 32px ${metric.color}26`;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
              }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${metric.color}, ${metric.color}99)`,
                  }}
                >
                  <metric.icon className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-serif font-semibold text-white">{metric.name}</h3>
                  <span className="text-2xl font-mono font-bold" style={{ color: metric.color }}>
                    {metric.value}
                  </span>
                </div>
              </div>
              <p className="text-[#94a3b8] text-sm leading-relaxed">{metric.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
