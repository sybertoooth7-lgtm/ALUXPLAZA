// frontend/src/pages/ClientLogin.tsx
import { useState, useCallback, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { secureFetch, isHoneypotTriggered } from '@/lib/security';
import { SecurityHoneypot } from '@/components/SecurityHoneypot';

type ResendStatus = 'idle' | 'sending' | 'sent' | 'error';

interface LoginResponse {
  success?: boolean;
  email?: string;
  companyName?: string;
  newDeviceAlert?: boolean;
  code?: string;
  error?: string;
}

export default function ClientLogin() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendStatus, setResendStatus] = useState<ResendStatus>('idle');

  const emailRef = useRef<HTMLInputElement>(null);

  const clearError = useCallback(() => {
    setError('');
    setNeedsVerification(false);
    setResendStatus('idle');
  }, []);

  const validateForm = useCallback((): boolean => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      emailRef.current?.focus();
      return false;
    }
    if (!password) {
      setError('Please enter your password.');
      return false;
    }
    return true;
  }, [email, password]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    clearError();

    if (!validateForm()) return;
    if (isHoneypotTriggered()) {
      setError('Security check failed.');
      return;
    }

    setLoading(true);

    try {
      const res = await secureFetch('/api/client/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      let data: LoginResponse = {};
      try {
        data = await res.json();
      } catch {
        // leave data empty if body isn't JSON
      }

      if (!res.ok) {
        if (res.status === 403 && data.code === 'EMAIL_NOT_VERIFIED') {
          setNeedsVerification(true);
          throw new Error(data.error || 'Please verify your email before logging in.');
        }
        throw new Error(data.error || `Login failed (${res.status})`);
      }

      if (data.newDeviceAlert) {
        // TODO: swap for a toast or banner in a real app
        console.warn('[ClientLogin] New device login detected — check your email.');
      }

      navigate('/client/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (resendStatus === 'sending' || resendStatus === 'sent') return;

    setResendStatus('sending');
    try {
      const res = await secureFetch('/api/client/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      // We always show the same message regardless of 200 vs 404
      // (enumeration-resistant backend), but we track network errors.
      if (!res.ok && res.status !== 200) {
        // absorb the error silently; the backend is enumeration-resistant
      }

      setResendStatus('sent');
    } catch {
      setResendStatus('error');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-base px-4">
      <div className="w-full max-w-md p-8 bg-navy-surface rounded-2xl border border-white/10 relative shadow-2xl">
        <SecurityHoneypot />

        <header className="text-center mb-8">
          <h1 className="font-serif text-lg text-alux-gold tracking-wide">ALUX PLAZA</h1>
          <p className="text-xs text-white/40 mt-1 uppercase tracking-widest">Client Portal</p>
        </header>

        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="mb-5 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm"
          >
            <p>{error}</p>

            {needsVerification && (
              <div className="mt-3">
                {resendStatus !== 'sent' && resendStatus !== 'error' && (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendStatus === 'sending'}
                    className="text-alux-cyan hover:underline text-xs disabled:opacity-50 disabled:no-underline"
                  >
                    {resendStatus === 'sending'
                      ? 'Sending verification email…'
                      : 'Resend verification email'}
                  </button>
                )}

                {resendStatus === 'sent' && (
                  <p className="text-green-400 text-xs">
                    If this account exists and is unverified, a new link has been sent.
                  </p>
                )}

                {resendStatus === 'error' && (
                  <p className="text-red-300 text-xs">
                    Could not resend email right now. Please try again shortly.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm text-white/70 mb-1.5">
              Email
            </label>
            <input
              ref={emailRef}
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) clearError();
              }}
              className="w-full bg-navy-light border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-alux-cyan/50 focus:border-alux-cyan/50 transition"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm text-white/70 mb-1.5">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) clearError();
              }}
              className="w-full bg-navy-light border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-alux-cyan/50 focus:border-alux-cyan/50 transition"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-alux-cyan text-navy-base font-semibold py-2.5 rounded-lg hover:bg-alux-cyan/90 active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 transition"
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <footer className="flex items-center justify-between mt-6 text-sm">
          <Link to="/client/signup" className="text-alux-cyan hover:underline underline-offset-2">
            Create account
          </Link>
          <Link
            to="/forgot-password"
            className="text-white/40 hover:text-white/70 transition underline-offset-2"
          >
            Forgot password?
          </Link>
        </footer>
      </div>
    </div>
  );
}
