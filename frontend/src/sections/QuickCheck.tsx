import { useState } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';

interface Question {
  ask: string;
  gap: string;
  service: string;
}

const questions: Question[] = [
  {
    ask: 'Does everyone log in with a phone code, not just a password?',
    gap: 'Logins use a password only',
    service: 'Data protection and access audit',
  },
  {
    ask: 'Do you have a written plan for what to do if you get hacked?',
    gap: 'No plan for a hack',
    service: 'Incident response planning',
  },
  {
    ask: 'Have you tested restoring your backups?',
    gap: 'Backups never tested',
    service: 'Backup and encryption audit',
  },
  {
    ask: 'Do you know exactly who can see your customers’ data?',
    gap: 'Unclear who sees customer data',
    service: 'Data protection and access audit',
  },
  {
    ask: 'Are your computers and website updated every month?',
    gap: 'Updates are not regular',
    service: 'Vulnerability assessment',
  },
];

// Each answer is one point on the radar: cyan when covered, a pulsing red-orange ring for a gap.
function Radar({ answers, size }: { answers: boolean[]; size: number }) {
  const gapCount = answers.filter((a) => !a).length;
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={`Radar: ${gapCount} ${gapCount === 1 ? 'gap' : 'gaps'} found so far`}
      className="shrink-0"
    >
      <circle cx="50" cy="50" r="48" fill="rgba(0,212,255,0.04)" stroke="rgba(0,212,255,0.35)" />
      <circle cx="50" cy="50" r="32" fill="none" stroke="rgba(0,212,255,0.2)" />
      <circle cx="50" cy="50" r="16" fill="none" stroke="rgba(0,212,255,0.2)" />
      <line x1="50" y1="2" x2="50" y2="98" stroke="rgba(0,212,255,0.15)" />
      <line x1="2" y1="50" x2="98" y2="50" stroke="rgba(0,212,255,0.15)" />
      <g className="radar-sweep">
        <path d="M50 50 L50 2 A48 48 0 0 1 80.9 13.2 Z" fill="rgba(0,212,255,0.22)" />
        <line x1="50" y1="50" x2="50" y2="2" stroke="#00d4ff" strokeWidth="1.2" />
      </g>
      {questions.map((q, i) => {
        const angle = ((-90 + i * 72) * Math.PI) / 180;
        const cx = 50 + 34 * Math.cos(angle);
        const cy = 50 + 34 * Math.sin(angle);
        const a = answers[i];
        if (a === undefined) {
          return <circle key={q.gap} cx={cx} cy={cy} r="2" fill="rgba(0,212,255,0.3)" />;
        }
        if (a) {
          return <circle key={q.gap} cx={cx} cy={cy} r="3.2" fill="#00d4ff" />;
        }
        return (
          <g key={q.gap}>
            <circle cx={cx} cy={cy} r="3.5" fill="#ff7a6b" />
            <circle cx={cx} cy={cy} r="3.5" fill="none" stroke="#ff7a6b" className="radar-ping" />
          </g>
        );
      })}
    </svg>
  );
}

interface Props {
  onRequest: (message: string) => void;
}

const answerButton =
  'flex items-center justify-center gap-2 min-h-14 rounded font-head font-semibold text-lg border bg-site-base/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent';

export default function QuickCheck({ onRequest }: Props) {
  const [answers, setAnswers] = useState<boolean[]>([]);
  const step = answers.length;
  const done = step === questions.length;

  const gaps = questions.filter((_, i) => answers[i] === false);

  const answer = (yes: boolean) => setAnswers((prev) => [...prev, yes]);
  const back = () => setAnswers((prev) => prev.slice(0, -1));
  const reset = () => setAnswers([]);

  const request = () => {
    const message =
      gaps.length === 0
        ? 'I did the quick security check and we have the basics covered. I would like a full review.'
        : `I did the quick security check and answered no to:\n${gaps
            .map((g) => `- ${g.gap}`)
            .join('\n')}\nPlease contact me about help with these.`;
    onRequest(message);
  };

  const headline =
    gaps.length === 0 ? 'Good basics.' : gaps.length <= 2 ? 'A few gaps.' : 'Several gaps.';

  return (
    <div className="bg-site-raised/90 border border-site-accent/25 rounded-lg p-6 sm:p-8 shadow-[0_0_40px_-12px_rgba(0,212,255,0.35)]">
      <div className="flex items-center gap-4">
        <Radar answers={answers} size={done ? 104 : 64} />
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm text-site-accent">
            {done ? 'Scan complete' : `Check ${step + 1} of ${questions.length}`}
          </p>
          <div className="flex gap-1.5 mt-3" aria-hidden="true">
            {questions.map((q, i) => {
              const state =
                i < step
                  ? answers[i]
                    ? 'bg-site-accent'
                    : 'bg-site-high'
                  : i === step
                    ? 'bg-site-text/60'
                    : 'bg-site-rule';
              return (
                <span
                  key={q.gap}
                  className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${state}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {!done ? (
        <div key={step} className="fade-in">
          <p
            aria-live="polite"
            className="font-head font-semibold text-2xl sm:text-3xl leading-snug text-site-text mt-6 min-h-[6.5rem] text-balance"
          >
            {questions[step].ask}
          </p>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <button
              type="button"
              onClick={() => answer(true)}
              className={`${answerButton} border-site-rule text-site-text hover:border-site-accent`}
            >
              <Check className="w-5 h-5" aria-hidden="true" /> Yes
            </button>
            <button
              type="button"
              onClick={() => answer(false)}
              className={`${answerButton} border-site-rule text-site-text hover:border-site-high`}
            >
              <X className="w-5 h-5" aria-hidden="true" /> No
            </button>
          </div>
          {step > 0 && (
            <button
              type="button"
              onClick={back}
              className="inline-flex items-center gap-1 mt-4 font-text text-base text-site-muted hover:text-site-text"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
            </button>
          )}
        </div>
      ) : (
        <div className="fade-in">
          <p className="font-head font-semibold text-3xl sm:text-4xl text-site-text mt-6">
            {headline}
          </p>
          <p className="font-text text-lg text-site-muted mt-2">
            {questions.length - gaps.length} of {questions.length} basics covered.
          </p>
          {gaps.length > 0 && (
            <ul className="mt-5 border-t border-site-rule">
              {gaps.map((g) => (
                <li key={g.gap} className="py-3 border-b border-site-rule">
                  <p className="font-text text-lg text-site-text">{g.gap}</p>
                  <p className="font-mono text-sm text-site-muted mt-1">Help: {g.service}</p>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-6">
            <button
              type="button"
              onClick={request}
              className="font-head font-semibold text-lg bg-site-accent text-site-base px-6 py-3 rounded hover:bg-site-accent-hover transition-colors"
            >
              {gaps.length > 0 ? 'Get help with these' : 'Ask for a full review'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="font-text text-base text-site-muted underline underline-offset-4 hover:text-site-text"
            >
              Start again
            </button>
          </div>
        </div>
      )}

      <p className="font-text text-sm text-site-muted mt-6">
        A quick self-check, not a security scan.
      </p>
    </div>
  );
}
