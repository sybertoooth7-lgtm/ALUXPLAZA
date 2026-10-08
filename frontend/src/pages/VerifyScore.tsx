import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { API_BASE } from '@/lib/api';

interface VerificationResult {
  companyName: string;
  score: number;
  label: string;
  issuedAt: string;
  verifiedAt: string;
  verifiedBy: string;
}

const LABEL_STYLES: Record<string, string> = {
  Strong: 'text-alux-green',
  Adequate: 'text-alux-cyan',
  Developing: 'text-alux-gold',
  'Needs attention': 'text-alux-red',
};

export default function VerifyScore() {
  const { token } = useParams();
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function verify() {
      try {
        const res = await fetch(`${API_BASE}/api/verify/${token}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Verification failed.');
        }
        setResult(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setLoading(false);
      }
    }
    if (token) verify();
  }, [token]);

  return (
    <div className="min-h-screen bg-navy-base text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <span className="font-serif text-lg text-alux-gold">ALUX PLAZA</span>
          <p className="text-xs text-white/40 mt-1 uppercase tracking-wider">
            Risk Score Verification
          </p>
        </div>

        <div className="bg-navy-surface border border-white/10 rounded-2xl p-8">
          {loading && <p className="text-white/50 text-center">Verifying…</p>}

          {!loading && error && (
            <div className="text-center">
              <p className="text-alux-red font-medium mb-2">Verification failed</p>
              <p className="text-white/50 text-sm">{error}</p>
            </div>
          )}

          {!loading && result && (
            <div className="text-center">
              <p className="text-white/50 text-sm mb-1">Company</p>
              <p className="text-xl font-serif mb-6">{result.companyName}</p>

              <p className="text-white/50 text-sm mb-1">Risk Score</p>
              <p className="text-5xl font-bold font-mono mb-2">{result.score}</p>
              <p
                className={`text-sm font-semibold mb-6 ${LABEL_STYLES[result.label] || 'text-white/60'}`}
              >
                {result.label}
              </p>

              <div className="border-t border-white/10 pt-4 text-xs text-white/40 space-y-1">
                <p>Issued: {new Date(result.issuedAt).toLocaleDateString()}</p>
                <p>Verified just now by {result.verifiedBy}</p>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-white/30 mt-6">
          This score reflects a point-in-time compliance assessment conducted by Alux Plaza and is
          not a guarantee of security or creditworthiness.
        </p>
      </div>
    </div>
  );
}
