// frontend/src/components/MfaVerifyModal.tsx
// Shown during admin login when MFA is required.

import { useState } from 'react';
import { secureFetch } from '@/lib/security';

interface Props {
  mfaToken: string;
  onSuccess: (data: { email: string }) => void;
  onCancel: () => void;
}

export default function MfaVerifyModal({ mfaToken, onSuccess, onCancel }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await secureFetch('/api/admin/mfa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfaToken, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Invalid code');
      onSuccess(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-navy-surface border border-white/10 rounded-2xl p-6 max-w-sm w-full">
        <h3 className="font-serif text-lg text-alux-gold mb-1">Two-Factor Authentication</h3>
        <p className="text-white/60 text-sm mb-4">
          Enter the 6-digit code from your authenticator app.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-full bg-navy-base border border-white/15 rounded-lg px-4 py-3 text-white text-center text-2xl font-mono tracking-[0.5em] placeholder-white/20 mb-3 focus:outline-none focus:border-alux-gold"
            placeholder="000000"
          />
          {error && <p className="text-alux-red text-sm mb-3">{error}</p>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 border border-white/15 text-white/60 px-4 py-2.5 rounded-lg hover:text-white hover:border-white/30 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="flex-1 bg-alux-gold text-navy-base font-semibold px-4 py-2.5 rounded-lg hover:bg-alux-gold/90 transition-colors disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
