import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { secureFetch, isHoneypotTriggered } from '@/lib/security';
import { SecurityHoneypot } from '@/components/SecurityHoneypot';

type VerifyStatus = 'loading' | 'success' | 'error';
type ResendStatus = 'idle' | 'sending' | 'sent';

export default function VerifyEmail() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState<VerifyStatus>(() => (token ? 'loading' : 'error'));
  const [message, setMessage] = useState(() =>
    token ? '' : 'No verification token found in the URL.'
  );
  const [resendEmail, setResendEmail] = useState('');
  const [resendStatus, setResendStatus] = useState<ResendStatus>('idle');
  const [countdown, setCountdown] = useState(3);

  const emailInputRef = useRef<HTMLInputElement>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  // Auto-focus email input when error state appears
  useEffect(() => {
    if (status === 'error') {
      const timer = setTimeout(() => emailInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [status]);

  // Auto-redirect to login on success
  useEffect(() => {
    if (status !== 'success') return;

    countdownIntervalRef.current = setInterval(() => {
      setCountdown((c) => (c <= 1 ? 1 : c - 1));
    }, 1000);

    redirectTimerRef.current = setTimeout(() => {
      navigate('/client/login');
    }, 3000);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, [status, navigate]);

  // Verify token on mount
  useEffect(() => {
    if (!token) return;

    let mounted = true;

    async function verify() {
      try {
        const res = await secureFetch('/api/client/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'Verification failed.');
        }

        if (!mounted) return;
        setStatus('success');
        setMessage(data.message || 'Email verified successfully.');
      } catch (err) {
        if (!mounted) return;
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Verification failed.');
      }
    }

    verify();
    return () => {
      mounted = false;
    };
  }, [token]);

  const handleResend = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!resendEmail.trim()) return;

      // Silently swallow bot submissions
      if (isHoneypotTriggered()) {
        setResendStatus('sent');
        return;
      }

      setResendStatus('sending');

      try {
        const res = await secureFetch('/api/client/resend-verification', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: resendEmail.trim() }),
        });

        await res.json().catch(() => ({}));
        setResendStatus('sent');
      } catch {
        // Generic response to prevent email enumeration
        setResendStatus('sent');
      }
    },
    [resendEmail]
  );

  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resendEmail);

  return (
    <div className="min-h-screen bg-navy-base text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in-up">
        {/* Brand header */}
        <div className="text-center mb-6">
          <span className="font-serif text-lg text-alux-gold">ALUX PLAZA</span>
          <p className="text-xs text-white/40 mt-1 uppercase tracking-wider">Email Verification</p>
        </div>

        {/* Card */}
        <div
          className="bg-navy-surface border border-white/10 rounded-2xl p-8 text-center"
          aria-live="polite"
          aria-busy={status === 'loading'}
        >
          {/* Loading */}
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-4 py-4" role="status">
              <div className="w-8 h-8 border-2 border-white/20 border-t-alux-cyan rounded-full animate-spin" />
              <p className="text-white/50">Verifying your email…</p>
            </div>
          )}

          {/* Success */}
          {status === 'success' && (
            <div role="status">
              <div className="w-12 h-12 bg-alux-green/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-alux-green"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-alux-green font-medium mb-2">Email Verified</p>
              <p className="text-white/60 text-sm mb-2">{message}</p>
              <p className="text-white/40 text-xs mb-6">Redirecting to login in {countdown}s…</p>
              <Link
                to="/client/login"
                className="inline-block bg-alux-cyan text-navy-base font-semibold px-6 py-2.5 rounded-lg hover:bg-alux-cyan/90 transition-colors"
              >
                Go to Login
              </Link>
            </div>
          )}

          {/* Error + Resend */}
          {status === 'error' && (
            <div>
              <div className="w-12 h-12 bg-alux-red/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-6 h-6 text-alux-red"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-alux-red font-medium mb-2">Verification Failed</p>
              <p className="text-white/60 text-sm mb-6">{message}</p>

              {resendStatus !== 'sent' ? (
                <form
                  onSubmit={handleResend}
                  className="relative space-y-3 text-left"
                  aria-label="Resend verification email"
                >
                  <p className="text-sm text-white/40 text-center">
                    Enter your email to request a new link:
                  </p>

                  <SecurityHoneypot />

                  <input
                    ref={emailInputRef}
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    className="w-full bg-navy-base border border-white/15 rounded-lg px-4 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:border-alux-gold transition-colors"
                    placeholder="you@company.com"
                    required
                    autoComplete="email"
                    aria-label="Email address"
                  />

                  <button
                    type="submit"
                    disabled={resendStatus === 'sending' || !isEmailValid}
                    className="w-full bg-navy-light border border-white/20 text-white font-medium py-2.5 rounded-lg hover:bg-white/5 disabled:opacity-50 transition-colors"
                  >
                    {resendStatus === 'sending' ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        Sending…
                      </span>
                    ) : (
                      'Resend Verification Link'
                    )}
                  </button>
                </form>
              ) : (
                <div
                  className="bg-alux-green/5 border border-alux-green/20 rounded-lg p-4"
                  role="status"
                >
                  <p className="text-alux-green text-sm">
                    If this account exists and is unverified, a new link has been sent.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer hint */}
        <p className="text-center text-xs text-white/30 mt-6">
          Didn&apos;t receive an email? Check your spam folder or request a new link above.
        </p>
      </div>
    </div>
  );
}
