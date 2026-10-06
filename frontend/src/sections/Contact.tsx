import React, { useState } from 'react';
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

export default function Contact() {
  const [form, setForm] = useState<FormState>({ name: '', email: '', company: '', message: '' });
  const [status, setStatus] = useState<SubmitStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [consent, setConsent] = useState(false);

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

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    marginBottom: '4px',
    border: '1px solid #ccc',
    borderRadius: '6px',
    fontSize: '16px',
    boxSizing: 'border-box',
    // Without these, the input inherits this page's global dark-theme
    // text color (white) while keeping a plain white background —
    // typed text becomes invisible even though it's really there.
    color: '#111827',
    backgroundColor: '#fff',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    marginBottom: '6px',
    fontWeight: 600,
    fontSize: '14px',
    color: '#333',
  };

  const counterStyle = (current: number, max: number): React.CSSProperties => ({
    fontSize: '12px',
    color: current >= max ? '#d32f2f' : '#666',
    textAlign: 'right',
    marginBottom: '12px',
  });

  return (
    <section id="contact" style={{ maxWidth: 600, margin: '0 auto', padding: '40px 20px' }}>
      <h2 style={{ marginBottom: 8 }}>Contact Us</h2>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Have a question? Send us a message and we will get back to you.
      </p>

      <form onSubmit={handleSubmit} noValidate>
        <div style={{ marginBottom: 4 }}>
          <label htmlFor="name" style={labelStyle}>
            Name <span style={{ color: '#d32f2f' }}>*</span>
          </label>
          <input
            id="name"
            name="name"
            type="text"
            value={form.name}
            onChange={handleChange}
            required
            maxLength={MAX_NAME}
            placeholder="Your full name"
            style={inputStyle}
          />
          <div style={counterStyle(form.name.length, MAX_NAME)}>
            {form.name.length} / {MAX_NAME}
          </div>
        </div>

        <div style={{ marginBottom: 4 }}>
          <label htmlFor="email" style={labelStyle}>
            Email <span style={{ color: '#d32f2f' }}>*</span>
          </label>
          <input
            id="email"
            name="email"
            type="email"
            value={form.email}
            onChange={handleChange}
            required
            maxLength={MAX_EMAIL}
            placeholder="you@example.com"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 4 }}>
          <label htmlFor="company" style={labelStyle}>
            Company
          </label>
          <input
            id="company"
            name="company"
            type="text"
            value={form.company}
            onChange={handleChange}
            maxLength={MAX_COMPANY}
            placeholder="Your company (optional)"
            style={inputStyle}
          />
          <div style={counterStyle(form.company.length, MAX_COMPANY)}>
            {form.company.length} / {MAX_COMPANY}
          </div>
        </div>

        <div style={{ marginBottom: 4 }}>
          <label htmlFor="message" style={labelStyle}>
            Message <span style={{ color: '#d32f2f' }}>*</span>
          </label>
          <textarea
            id="message"
            name="message"
            value={form.message}
            onChange={handleChange}
            required
            maxLength={MAX_MESSAGE}
            rows={6}
            placeholder="How can we help you?"
            style={{ ...inputStyle, resize: 'vertical', minHeight: 120 }}
          />
          <div style={counterStyle(form.message.length, MAX_MESSAGE)}>
            {form.message.length} / {MAX_MESSAGE}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label
            htmlFor="consent"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: '14px',
              color: '#333',
              cursor: 'pointer',
            }}
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
              style={{ marginTop: 3, flexShrink: 0 }}
            />
            <span>
              I agree that Alux Plaza may use the details I provide here to respond to my enquiry,
              as described in the{' '}
              <a
                href="/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: '#1976d2', textDecoration: 'underline' }}
              >
                Privacy Policy
              </a>
              . I can withdraw this at any time by emailing privacy@aluxplaza.com.{' '}
              <span style={{ color: '#d32f2f' }}>*</span>
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={status === 'submitting'}
          style={{
            width: '100%',
            padding: '12px 20px',
            backgroundColor: status === 'submitting' ? '#999' : '#1976d2',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: 600,
            cursor: status === 'submitting' ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.2s',
          }}
        >
          {status === 'submitting' ? 'Sending...' : 'Send Message'}
        </button>

        {status === 'success' && (
          <div
            style={{
              marginTop: 16,
              padding: '12px 16px',
              backgroundColor: '#e8f5e9',
              color: '#2e7d32',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            ✅ Message sent successfully! We will get back to you soon.
          </div>
        )}

        {status === 'error' && (
          <div
            style={{
              marginTop: 16,
              padding: '12px 16px',
              backgroundColor: '#ffebee',
              color: '#c62828',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          >
            ❌ {errorMsg}
          </div>
        )}
      </form>
    </section>
  );
}
