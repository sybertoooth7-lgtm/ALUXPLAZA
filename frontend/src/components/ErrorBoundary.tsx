// frontend/src/components/ErrorBoundary.tsx
// React only supports error boundaries as class components — there's no
// hook equivalent for getDerivedStateFromError/componentDidCatch.
//
// IMPORTANT: this boundary does NOT reset its own error state once
// tripped. It's meant to be rendered with a `key` that changes on
// navigation (see App.tsx, which keys it off location.pathname) — that
// makes React unmount and remount it fresh on every route change, so one
// caught error doesn't permanently wedge the whole app into showing the
// fallback for every subsequent page.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { captureError } from '@/lib/sentry';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureError(error, { componentStack: info.componentStack });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-navy-base text-white flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <p className="font-serif text-lg text-alux-gold mb-2">ALUX PLAZA</p>
            <h1 className="text-xl font-semibold mb-2">Something went wrong</h1>
            <p className="text-white/50 mb-8">
              This page hit an unexpected error. Reloading usually fixes it — if it keeps happening,
              please let us know.
            </p>
            {/* Deliberately a plain <a>, not react-router's <Link>: we've
                just caught an unexpected render error, so a full page
                reload (fresh JS runtime) is more trustworthy recovery
                than asking the same runtime to navigate client-side. */}
            <a
              href="/"
              className="inline-block bg-alux-cyan text-navy-base font-semibold px-6 py-2.5 rounded-lg hover:bg-alux-cyan/90 transition-colors"
            >
              Back to home
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
