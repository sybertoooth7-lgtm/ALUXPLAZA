import { useState, useCallback, useRef, useEffect } from 'react';
import { Link } from 'react-router';
import { secureFetch, isHoneypotTriggered } from '@/lib/security';
import { SecurityHoneypot } from '@/components/SecurityHoneypot';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const emailInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus email field on mount
  useEffect(() => {
    emailInputRef.current?.focus();
  }, []);

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isEmailValid) return;

      setError('');
      setSuccess('');
      setLoading(true);

      if (isHoneypotTriggered()) {
        setError('Security check failed.');
        setLoading(false);
        return;
      }

      try {
        const res = await secureFetch('/api/client/password-reset/request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email.trim() }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || 'Request failed');
        }

        setSuccess(data.message || 'If this account exists, a password reset link has been sent.');
        setEmail('');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        // Return focus to the input so screen-reader users know where to act
        setTimeout(() => emailInputRef.current?.focus(), 50);
      } finally {
        setLoading(false);
      }
    },
    [email, isEmailValid]
  );

  return (
    <div className="min-h-screen bg-navy-base text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in-up">
        {/* Brand header */}
        <div className="text-center mb-6">
          <span className="font-serif text-lg text-alux-gold">ALUX PLAZA</span>
          <p className="text-xs text-white/40 mt-1 uppercase tracking-wider">Client Portal</p>
        </div>

        {/* Card */}
        <div
          className="bg-navy-surface border border-white/10 rounded-2xl p-8 relative"
          aria-live="polite"
          aria-busy={loading}
        >
          <SecurityHoneypot />

          <h2 className="text-xl font-bold mb-2">Reset Password</h2>
          <p className="text-sm text-white/50 mb-6">
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>

          {/* Error */}
          {error && (
            <div
              className="mb-4 flex items-start gap-3 p-3 rounded-lg bg-alux-red/5 border border-alux-red/20 text-alux-red text-sm"
              role="alert"
            >
              <svg
                className="w-4 h-4 mt-0.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {/* Success */}
          {success && (
            <div
              className="mb-4 flex items-start gap-3 p-3 rounded-lg bg-alux-green/5 border border-alux-green/20 text-alux-green text-sm"
              role="status"
            >
              <svg
                className="w-4 h-4 mt-0.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" aria-label="Password reset request">
            <div>
              <label htmlFor="reset-email" className="block text-sm text-white/70 mb-1">
                Email
              </label>
              <input
                ref={emailInputRef}
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-navy-base border border-white/15 rounded-lg px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:border-alux-gold transition-colors disabled:opacity-50"
                placeholder="you@company.com"
                required
                autoComplete="email"
                aria-label="Email address"
                disabled={!!success}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !!success || !isEmailValid}
              className="w-full bg-alux-cyan text-navy-base font-semibold py-2.5 rounded-lg hover:bg-alux-cyan/90 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-navy-base/30 border-t-navy-base rounded-full animate-spin" />
                  Sending…
                </span>
              ) : (
                'Send Reset Link'
              )}
            </button>
          </form>

          <p className="text-center text-sm text-white/40 mt-6">
            <Link to="/client/login" className="text-alux-cyan hover:underline transition-colors">
              Back to login
            </Link>
          </p>
        </div>

        {/* Footer hint */}
        <p className="text-center text-xs text-white/30 mt-6">
          If you don&apos;t see the email within a few minutes, check your spam folder.
        </p>
      </div>
    </div>
  );
}
