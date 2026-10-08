// frontend/src/lib/security.ts
// Client-side utilities for CSRF handling and honeypot support.
// NOTE: Request signing was removed because any client-side secret
// is trivially extractable from the JS bundle, making it useless.

import { API_BASE } from './api';

// Frontend (Vercel) and backend (Render) are on different domains, so
// document.cookie can never see the backend's csrfToken cookie — cookie
// visibility to JS is scoped to the domain that set it, and SameSite
// flags don't change that. Cache the token in memory instead, fetched
// once from a dedicated endpoint that echoes back the server's copy.
let cachedCsrfToken: string | null = null;

async function fetchCsrfToken(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/csrf-token`, { credentials: 'include' });
  const data = await res.json();
  cachedCsrfToken = data.csrfToken;
  return cachedCsrfToken as string;
}

async function getCsrfToken(): Promise<string> {
  if (cachedCsrfToken) return cachedCsrfToken;
  return fetchCsrfToken();
}

/**
 * Fetch wrapper that automatically attaches:
 * - CSRF token from cookie header (only for state-changing methods)
 * - Standard browser headers that bots often omit
 * - credentials: 'include' for cookie-based auth
 */
export async function secureFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const method = (options.method || 'GET').toUpperCase();
  const isStateChanging = !['GET', 'HEAD', 'OPTIONS'].includes(method);

  async function doFetch(): Promise<Response> {
    const headers = new Headers(options.headers || {});
    if (isStateChanging) {
      headers.set('x-csrf-token', await getCsrfToken());
    }
    headers.set('Accept', 'application/json');
    headers.set('Accept-Language', navigator.language || 'en-US');

    return fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });
  }

  const res = await doFetch();

  // A cached token can go stale (rotated, expired, first-ever request
  // raced the cookie being set). One retry with a freshly fetched token
  // covers that without silently failing every request until reload.
  if (isStateChanging && res.status === 403) {
    const body = await res
      .clone()
      .json()
      .catch(() => null);
    if (body?.error === 'CSRF token missing' || body?.error === 'Invalid CSRF token') {
      cachedCsrfToken = null;
      return doFetch();
    }
  }

  return res;
}

/**
 * Checks if the honeypot field was filled. Call this before submitting a form.
 * Returns true if the submission looks bot-generated.
 */
export function isHoneypotTriggered(): boolean {
  const el = document.getElementById('website_url') as HTMLInputElement | null;
  return !!(el && el.value && el.value.trim().length > 0);
}
