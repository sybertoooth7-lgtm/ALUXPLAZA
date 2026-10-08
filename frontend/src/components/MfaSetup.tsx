// frontend/src/components/MfaSetup.tsx
// Admin MFA enrollment flow: QR code display + verification.

import { useState } from 'react';
import { secureFetch } from '@/lib/security';

export default function MfaSetup({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState<'start' | 'qr' | 'backup'>('start');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [manualKey, setManualKey] = useState('');
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function startEnrollment() {
    setLoading(true);
    setError('');
    try {
      const res = await secureFetch('/api/admin/mfa/enroll', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Enrollment failed');
      setOtpauthUrl(data.otpauthUrl);
      setManualKey(data.manualEntryKey);
      setStep('qr');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start enrollment');
    } finally {
      setLoading(false);
    }
  }

  async function verifyEnrollment() {
    setLoading(true);
    setError('');
    try {
      const res = await secureFetch('/api/admin/mfa/verify-enrollment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      setBackupCodes(data.backupCodes);
      setStep('backup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  if (step === 'start') {
    return (
      <div className="bg-navy-surface border border-white/10 rounded-2xl p-6 max-w-md">
        <h3 className="font-serif text-lg text-alux-gold mb-2">Enable Two-Factor Authentication</h3>
        <p className="text-white/60 text-sm mb-4">
          Add an extra layer of security to your admin account using an authenticator app (Google
          Authenticator, Authy, 1Password, etc.).
        </p>
        {error && <p className="text-alux-red text-sm mb-3">{error}</p>}
        <button
          onClick={startEnrollment}
          disabled={loading}
          className="bg-alux-gold text-navy-base font-semibold px-5 py-2.5 rounded-lg hover:bg-alux-gold/90 transition-colors disabled:opacity-50"
        >
          {loading ? 'Generating...' : 'Start Setup'}
        </button>
      </div>
    );
  }

  if (step === 'qr') {
    return (
      <div className="bg-navy-surface border border-white/10 rounded-2xl p-6 max-w-md">
        <h3 className="font-serif text-lg text-alux-gold mb-2">Scan QR Code</h3>
        <p className="text-white/60 text-sm mb-4">
          Open your authenticator app and scan this QR code, or enter the key manually.
        </p>

        {/* QR Code — use a simple data URI or an img tag if you have a QR library */}
        <div className="bg-white p-4 rounded-lg mb-4 flex justify-center">
          {/* If you have qrcode library installed: */}
          {/* <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`} alt="MFA QR Code" /> */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`}
            alt="MFA QR Code"
            className="w-48 h-48"
          />
        </div>

        <div className="bg-navy-base border border-white/10 rounded-lg p-3 mb-4">
          <p className="text-xs text-white/40 mb-1">Manual entry key</p>
          <code className="text-sm text-alux-cyan font-mono break-all">{manualKey}</code>
        </div>

        <label className="block text-sm text-white/60 mb-2">
          Enter the 6-digit code from your authenticator app:
        </label>
        <input
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="w-full bg-navy-base border border-white/15 rounded-lg px-4 py-2.5 text-white placeholder-white/30 mb-3 focus:outline-none focus:border-alux-gold"
          placeholder="000000"
        />
        {error && <p className="text-alux-red text-sm mb-3">{error}</p>}
        <button
          onClick={verifyEnrollment}
          disabled={loading || code.length !== 6}
          className="w-full bg-alux-gold text-navy-base font-semibold px-5 py-2.5 rounded-lg hover:bg-alux-gold/90 transition-colors disabled:opacity-50"
        >
          {loading ? 'Verifying...' : 'Verify & Enable'}
        </button>
      </div>
    );
  }

  // step === 'backup'
  return (
    <div className="bg-navy-surface border border-white/10 rounded-2xl p-6 max-w-md">
      <h3 className="font-serif text-lg text-alux-gold mb-2">Save Your Backup Codes</h3>
      <p className="text-white/60 text-sm mb-4">
        These codes let you log in if you lose access to your authenticator app.
        <strong className="text-alux-red"> Save them now — they will never be shown again.</strong>
      </p>
      <div className="bg-navy-base border border-alux-gold/30 rounded-lg p-4 mb-4 space-y-2">
        {backupCodes.map((c, i) => (
          <code key={i} className="block text-sm text-alux-gold font-mono tracking-wider">
            {c}
          </code>
        ))}
      </div>
      <button
        onClick={onComplete}
        className="w-full bg-alux-gold text-navy-base font-semibold px-5 py-2.5 rounded-lg hover:bg-alux-gold/90 transition-colors"
      >
        Done — I've Saved Them
      </button>
    </div>
  );
}
