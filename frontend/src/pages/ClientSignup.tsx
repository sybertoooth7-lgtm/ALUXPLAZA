// frontend/src/pages/ClientSignup.tsx
// Client self-registration. Uses secureFetch (CSRF auto-attached) + honeypot.
// Does NOT use broken client-side request signing.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { secureFetch, isHoneypotTriggered } from '@/lib/security';
import { SecurityHoneypot } from '@/components/SecurityHoneypot';

export default function ClientSignup() {
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    // Honeypot check: if filled, it's a bot
    if (isHoneypotTriggered()) {
      setError('Security check failed.');
      setLoading(false);
      return;
    }

    // The server enforces this too; checking here just avoids a round trip.
    if (!consent) {
      setError('Please tick the box to agree to the Privacy Policy before creating an account.');
      setLoading(false);
      return;
    }

    try {
      const res = await secureFetch('/api/client/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, email, password, consent }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const consentError = Array.isArray(data.details)
          ? data.details.find((d: { path?: string }) => d?.path === 'consent')
          : undefined;
        throw new Error(consentError?.msg || data.error || 'Signup failed');
      }

      setSuccess(data.message || 'Account created. Please verify your email.');
      setCompanyName('');
      setEmail('');
      setPassword('');
      setConsent(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy-dark px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <span className="font-serif text-lg text-alux-gold">ALUX PLAZA</span>
          <p className="text-xs text-white/40 mt-1 uppercase tracking-wider">Client Portal</p>
        </div>

        <div className="bg-navy border border-white/10 rounded-2xl p-8 relative">
          <SecurityHoneypot />

          <h2 className="text-2xl font-bold text-white mb-6">Create Account</h2>

          {error && (
            <div
              className="mb-4 p-3 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-sm"
              aria-live="polite"
            >
              {error}
            </div>
          )}

          {success && (
            <div
              className="mb-4 p-3 rounded bg-green-500/10 border border-green-500/30 text-green-400 text-sm"
              aria-live="polite"
            >
              <p className="mb-2">{success}</p>
              <button
                type="button"
                onClick={() => navigate('/client/login')}
                className="text-alux-cyan hover:underline font-medium"
              >
                Go to Sign In →
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="companyName" className="block text-sm text-white/70 mb-1">
                Company Name
              </label>
              <input
                id="companyName"
                name="companyName"
                type="text"
                autoComplete="organization"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-navy-light border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:border-alux-gold"
                placeholder="Acme Corp"
                required
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-sm text-white/70 mb-1">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-navy-light border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:border-alux-gold"
                placeholder="you@company.com"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm text-white/70 mb-1">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-navy-light border border-white/10 rounded-lg px-3.5 py-2.5 text-white placeholder:text-white/30 focus:outline-none focus:border-alux-gold"
                placeholder="••••••••"
                required
              />
              <p className="text-xs text-white/30 mt-1">Minimum 8 characters</p>
            </div>

            <div>
              <label
                htmlFor="consent"
                className="flex items-start gap-2 text-sm text-white/70 cursor-pointer"
              >
                <input
                  id="consent"
                  name="consent"
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => {
                    setConsent(e.target.checked);
                    if (e.target.checked) setError('');
                  }}
                  required
                  aria-required="true"
                  className="mt-1 h-4 w-4 shrink-0 accent-alux-cyan"
                />
                <span>
                  I agree that Alux Plaza may use the details I provide to create and manage my
                  account, as described in the{' '}
                  <a
                    href="/privacy-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-alux-cyan hover:underline"
                  >
                    Privacy Policy
                  </a>
                  . I can withdraw this at any time by emailing privacy@aluxplaza.com.
                </span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-alux-cyan text-navy-dark font-semibold py-2.5 rounded-lg hover:bg-alux-cyan/90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-white/40 mt-6">
            Already have an account?{' '}
            <Link to="/client/login" className="text-alux-cyan hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
