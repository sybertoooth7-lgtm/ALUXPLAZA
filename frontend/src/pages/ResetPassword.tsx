import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router';
import { secureFetch } from '@/lib/security';

export default function ResetPassword() {
  const { token } = useParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(() => (token ? '' : 'Invalid or missing reset token.'));
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus first field once a token is present
  useEffect(() => {
    if (token) {
      passwordInputRef.current?.focus();
    }
  }, [token]);

  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;
  const minLengthMet = password.length >= 8;
  const canSubmit = !!token && !loading && !success && minLengthMet && passwordsMatch;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;

      setError('');
      setSuccess('');
      setLoading(true);

      try {
        const res = await secureFetch('/api/client/password-reset/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.error || 'Reset failed');
        }

        setSuccess(data.message || 'Password updated successfully.');
        setPassword('');
        setConfirmPassword('');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setTimeout(() => passwordInputRef.current?.focus(), 50);
      } finally {
        setLoading(false);
      }
    },
    [canSubmit, token, password]
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
          className="bg-navy-surface border border-white/10 rounded-2xl p-8"
          aria-live="polite"
          aria-busy={loading}
        >
          <h2 className="text-xl font-bold mb-2">Set New Password</h2>
          <p className="text-sm text-white/50 mb-6">Choose a strong password for your account.</p>

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

          {!success && (
            <form onSubmit={handleSubmit} className="space-y-4" aria-label="Reset password">
              <div>
                <label htmlFor="new-password" className="block text-sm text-white/70 mb-1">
                  New Password
                </label>
                <input
                  ref={passwordInputRef}
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-navy-base border border-white/15 rounded-lg px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:border-alux-gold transition-colors"
                  placeholder="••••••••"
                  minLength={8}
                  required
                  autoComplete="new-password"
                  aria-describedby="password-hint"
                />
                <p
                  id="password-hint"
                  className={`text-xs mt-1 ${
                    password.length > 0 && !minLengthMet ? 'text-alux-red' : 'text-white/30'
                  }`}
                >
                  Must be at least 8 characters
                </p>
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm text-white/70 mb-1">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full bg-navy-base border rounded-lg px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none transition-colors ${
                    confirmPassword.length > 0
                      ? passwordsMatch
                        ? 'border-alux-green/50 focus:border-alux-green'
                        : 'border-alux-red/50 focus:border-alux-red'
                      : 'border-white/15 focus:border-alux-gold'
                  }`}
                  placeholder="••••••••"
                  minLength={8}
                  required
                  autoComplete="new-password"
                  disabled={!token}
                />
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="text-xs text-alux-red mt-1">Passwords do not match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full bg-alux-cyan text-navy-base font-semibold py-2.5 rounded-lg hover:bg-alux-cyan/90 transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-navy-base/30 border-t-navy-base rounded-full animate-spin" />
                    Updating…
                  </span>
                ) : (
                  'Update Password'
                )}
              </button>
            </form>
          )}

          {success && (
            <div className="mt-4 text-center">
              <Link
                to="/client/login"
                className="inline-block bg-alux-cyan text-navy-base font-semibold px-6 py-2.5 rounded-lg hover:bg-alux-cyan/90 transition-colors"
              >
                Go to Login
              </Link>
            </div>
          )}
        </div>

        {/* Footer hint */}
        {!success && (
          <p className="text-center text-xs text-white/30 mt-6">
            Your reset link expires after 1 hour for security.
          </p>
        )}
      </div>
    </div>
  );
}
