// frontend/src/pages/AdminLogin.tsx
// MFA-aware admin login. Shows MfaVerifyModal when mfaRequired is true.

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { secureFetch } from '@/lib/security';
import MfaVerifyModal from '@/components/MfaVerifyModal';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await secureFetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.mfaRequired) {
        setMfaToken(data.mfaToken);
        setLoading(false);
        return;
      }

      // No MFA — login complete
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  }

  function handleMfaSuccess(_data: { email: string }) {
    setMfaToken(null);
    navigate('/admin/dashboard');
  }

  return (
    <div className="min-h-screen bg-navy-base text-white flex items-center justify-center px-4">
      <div className="bg-navy-surface border border-white/10 rounded-2xl p-8 max-w-sm w-full">
        <h1 className="font-serif text-2xl text-alux-gold mb-6">Admin Login</h1>

        <form onSubmit={handleLogin}>
          <label className="block text-sm text-white/60 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-navy-base border border-white/15 rounded-lg px-4 py-2.5 text-white mb-4 focus:outline-none focus:border-alux-gold"
            required
          />

          <label className="block text-sm text-white/60 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-navy-base border border-white/15 rounded-lg px-4 py-2.5 text-white mb-4 focus:outline-none focus:border-alux-gold"
            required
          />

          {error && <p className="text-alux-red text-sm mb-4">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-alux-gold text-navy-base font-semibold px-5 py-2.5 rounded-lg hover:bg-alux-gold/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>

      {mfaToken && (
        <MfaVerifyModal
          mfaToken={mfaToken}
          onSuccess={handleMfaSuccess}
          onCancel={() => {
            setMfaToken(null);
            setError('MFA verification cancelled.');
          }}
        />
      )}
    </div>
  );
}
