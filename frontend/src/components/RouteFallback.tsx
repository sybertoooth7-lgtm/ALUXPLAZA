// Shown while a lazily-loaded route chunk is in flight. Before code splitting
// this could not happen — every page was bundled — so the styling here just has
// to sit quietly on top of whatever the page underneath would have used.
//
// It uses the --background/--foreground theme tokens rather than the fixed
// navy palette, because theme-provider sets a light/dark class on <html> and
// the landing page honours it. A hardcoded navy fallback would have flashed
// dark on every navigation for light-theme visitors.
export default function RouteFallback() {
  return (
    <div
      className="min-h-screen bg-background text-foreground flex items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <p className="text-sm text-muted-foreground">Loading…</p>
    </div>
  );
}
