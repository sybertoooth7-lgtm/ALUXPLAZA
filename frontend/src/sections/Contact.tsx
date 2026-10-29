import React, { useEffect, useRef, useState } from 'react';
import { secureFetch } from '../lib/security';

const MAX_MESSAGE = 5000;
const MAX_COMPANY = 150;
const MAX_NAME = 100;
const MAX_EMAIL = 255;

interface FormState {
  name: string;
  email: string;
  company: string;
  message: string;
}

type SubmitStatus = 'idle' | 'submitting' | 'success' | 'error';

const fieldClass =
  'w-full rounded border border-site-rule bg-site-base px-3 py-3 font-text text-lg text-site-text placeholder:text-site-muted/60 focus:border-site-accent focus:outline-none focus:ring-1 focus:ring-site-accent';
const labelClass = 'block font-head text-base font-semibold text-site-text mb-1.5';

function Counter({ current, max }: { current: number; max: number }) {
  if (current < max * 0.8) return null;
  return (
    <p
      className={`mt-1 text-right font-text text-xs ${current >= max ? 'text-site-high' : 'text-site-muted'}`}
    >
      {current} / {max}
    </p>
  );
}

export default function Contact({ initialMessage = '' }: { initialMessage?: string }) {
  const [form, setForm] = useState<FormState>({ name: '', email: '', company: '', message: '' });
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [consent, setConsent] = useState(false);
  const lastPrefill = useRef('');

  // A message from the quick check fills the box, but never overwrites text the visitor typed.
  useEffect(() => {
    if (!initialMessage) return;
    const next = initialMessage.slice(0, MAX_MESSAGE);
    const previous = lastPrefill.current;
    lastPrefill.current = next;
    setForm((prev) =>
      prev.message === '' || prev.message === previous ? { ...prev, message: next } : prev
    );
  }, [initialMessage]);

  const limits: Record<keyof FormState, number> = {
    name: MAX_NAME,
    email: MAX_EMAIL,
    company: MAX_COMPANY,
    message: MAX_MESSAGE,
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target as { name: keyof FormState; value: string };
    if (value.length > limits[name]) return;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (status === 'error') setStatus('idle');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // The server enforces this too; checking here just avoids a round trip
    // and lets us show a clear message next to the button.
    if (!consent) {
      setStatus('error');
      setErrorMsg('Please tick the box to agree to the Privacy Policy before sending.');
      return;
    }

    setStatus('submitting');
    setErrorMsg('');

    try {
      // secureFetch attaches the CSRF header and sends credentials —
      // a plain fetch() here would fail with "CSRF token missing" and,
      // on a cross-origin deployment, wouldn't send/receive cookies at all.
      const res = await secureFetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, consent }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || data.errors?.[0]?.msg || `Server error: ${res.status}`);
      }

      setStatus('success');
      setForm({ name: '', email: '', company: '', message: '' });
      setConsent(false);
    } catch (err: unknown) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send message. Please try again.');
    }
  };

  return (
    <section
      id="contact"
      className="scroll-mt-16 bg-site-raised py-20 md:py-28 border-t border-site-rule"
    >
      <div className="max-w-6xl mx-auto px-5 sm:px-8 grid lg:grid-cols-12 gap-12 lg:gap-10">
        <div className="lg:col-span-5">
          <h2 className="font-head font-semibold text-3xl sm:text-4xl tracking-tight text-site-text">
            Tell us what you need
          </h2>
          <p className="font-text text-lg leading-relaxed text-site-muted mt-6">
            We reply by email.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="lg:col-span-6 lg:col-start-7 space-y-5">
          <div>
            <label htmlFor="name" className={labelClass}>
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              autoComplete="name"
              value={form.name}
              onChange={handleChange}
              required
              maxLength={MAX_NAME}
              className={fieldClass}
            />
            <Counter current={form.name.length} max={MAX_NAME} />
          </div>

          <div>
            <label htmlFor="email" className={labelClass}>
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={handleChange}
              required
              maxLength={MAX_EMAIL}
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="company" className={labelClass}>
              Company <span className="font-text font-normal text-site-muted">(optional)</span>
            </label>
            <input
              id="company"
              name="company"
              type="text"
              autoComplete="organization"
              value={form.company}
              onChange={handleChange}
              maxLength={MAX_COMPANY}
              className={fieldClass}
            />
            <Counter current={form.company.length} max={MAX_COMPANY} />
          </div>

          <div>
            <label htmlFor="message" className={labelClass}>
              What do you need?
            </label>
            <textarea
              id="message"
              name="message"
              value={form.message}
              onChange={handleChange}
              required
              maxLength={MAX_MESSAGE}
              rows={6}
              className={`${fieldClass} resize-y min-h-[140px]`}
            />
            <Counter current={form.message.length} max={MAX_MESSAGE} />
          </div>

          <label
            htmlFor="consent"
            className="flex items-start gap-3 font-text text-sm leading-relaxed text-site-muted cursor-pointer"
          >
            <input
              id="consent"
              name="consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (status === 'error') setStatus('idle');
              }}
              required
              aria-required="true"
              className="mt-1 h-4 w-4 shrink-0 accent-[#00d4ff]"
            />
            <span>
              I agree that Alux Plaza may use the details I provide here to respond to my enquiry,
              as described in the{' '}
              <a
                href="/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-site-accent underline underline-offset-2 hover:text-site-accent-hover"
              >
                Privacy Policy
              </a>
              . I can withdraw this at any time by emailing privacy@aluxplaza.com.
            </span>
          </label>

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="w-full sm:w-auto font-head font-semibold bg-site-accent text-site-base px-8 py-3 rounded hover:bg-site-accent-hover transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {status === 'submitting' ? 'Sending...' : 'Send request'}
          </button>

          {status === 'success' && (
            <p
              role="status"
              className="font-text text-site-text border-l-2 border-site-accent pl-4 py-1"
            >
              Thank you. Your message has been sent and we will reply by email.
            </p>
          )}

          {status === 'error' && (
            <p
              role="alert"
              className="font-text text-site-high border-l-2 border-site-high pl-4 py-1"
            >
              {errorMsg}
            </p>
          )}
        </form>
      </div>
    </section>
  );
}
