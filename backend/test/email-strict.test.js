import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Pins the behaviour lib/email-queue.js depends on: a failed send must
 * propagate, because pg-boss can only retry what it sees fail.
 *
 * Two separate bugs are covered here, and both were live:
 *
 *  1. Every sender wrapped resend.emails.send() in try/catch and only logged,
 *     so it always resolved. registerEmailWorker rethrows whatever the sender
 *     throws — but nothing ever threw, so jobs were marked complete on failure
 *     and the queue's retryLimit was inert.
 *
 *  2. The Resend v4 SDK does not throw on API-level failures. emails.send()
 *     resolves with { data, error }. So even after removing the try/catch, a
 *     422/429/5xx would still have resolved successfully. The `error` field has
 *     to be inspected explicitly.
 *
 * The mock returns the same { data, error } shape the real SDK returns, since
 * asserting against a thrown exception alone would not catch bug 2.
 */

const send = vi.fn();

vi.mock('resend', () => ({
  Resend: class Resend {
    constructor() {
      this.emails = { send };
    }
  },
}));

const load = async () => {
  vi.resetModules();
  return import('../src/lib/email.js');
};

const OK = { data: { id: 'msg_1' }, error: null };
// Exactly what Resend returns for e.g. a 422 or 500 — no throw.
const REJECTED = {
  data: null,
  error: { name: 'validation_error', message: 'Invalid to address' },
};

describe('lib/email.js strict delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = 're_test_fake';
    process.env.FROM_EMAIL = 'noreply@example.com';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.FRONTEND_URL = 'https://example.com';
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.FROM_EMAIL;
    delete process.env.ADMIN_EMAIL;
    delete process.env.FRONTEND_URL;
  });

  it('throws in strict mode when Resend returns an error instead of throwing', async () => {
    send.mockResolvedValue(REJECTED);
    const { sendVerificationEmail } = await load();

    await expect(
      sendVerificationEmail(
        { email: 'user@example.com', link: 'https://example.com/verify?token=abc' },
        { strict: true }
      )
    ).rejects.toThrow(/Resend rejected the message: Invalid to address/);
  });

  it('throws in strict mode when the SDK itself throws (network error)', async () => {
    send.mockRejectedValue(new Error('ECONNRESET'));
    const { sendPasswordResetEmail } = await load();

    await expect(
      sendPasswordResetEmail(
        { email: 'user@example.com', link: 'https://example.com/reset?token=abc' },
        { strict: true }
      )
    ).rejects.toThrow('ECONNRESET');
  });

  it('still resolves in non-strict mode, preserving the existing call sites', async () => {
    send.mockResolvedValue(REJECTED);
    const { sendVerificationEmail } = await load();

    // These are the inline fire-and-forget call sites in clientAuth.js etc.
    // They must keep resolving, or Node exits on an unhandled rejection.
    await expect(
      sendVerificationEmail({
        email: 'user@example.com',
        link: 'https://example.com/verify?token=abc',
      })
    ).resolves.toBeUndefined();
  });

  it('applies strict to every sender the queue uses', async () => {
    send.mockResolvedValue(REJECTED);
    const mod = await load();
    const frontendUrl = 'https://example.com';

    const cases = [
      ['sendVerificationEmail', { email: 'u@example.com', link: `${frontendUrl}/verify?token=a` }],
      ['sendPasswordResetEmail', { email: 'u@example.com', link: `${frontendUrl}/reset?token=a` }],
      ['sendContactNotification', { name: 'N', email: 'u@example.com', message: 'm', id: '1' }],
      ['sendNewDeviceAlert', { email: 'u@example.com', ip: '1.2.3.4', userAgent: 'ua' }],
    ];

    for (const [name, payload] of cases) {
      send.mockResolvedValue(REJECTED);
      await expect(mod[name](payload, { strict: true }), `${name} must throw`).rejects.toThrow(
        /Resend rejected the message/
      );
    }
  });

  it('resolves in strict mode when Resend accepts the message', async () => {
    send.mockResolvedValue(OK);
    const { sendVerificationEmail } = await load();

    await expect(
      sendVerificationEmail(
        { email: 'user@example.com', link: 'https://example.com/verify?token=abc' },
        { strict: true }
      )
    ).resolves.toBeUndefined();
  });

  it('does not throw in strict mode when there is no API key (dev mode)', async () => {
    // Dev mode has no RESEND_API_KEY, so the send is skipped by design. Throwing
    // here would make the queue retry a message that can never be sent.
    delete process.env.RESEND_API_KEY;
    const { sendVerificationEmail } = await load();

    await expect(
      sendVerificationEmail(
        { email: 'user@example.com', link: 'https://example.com/verify?token=abc' },
        { strict: true }
      )
    ).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses an unsafe link without throwing, even in strict mode', async () => {
    // Retrying a link that will never match FRONTEND_URL is futile, so this is
    // a skip rather than a failure — the job completes and stays visible in the
    // log line rather than burning five retries.
    send.mockResolvedValue(OK);
    const { sendVerificationEmail } = await load();

    await expect(
      sendVerificationEmail(
        { email: 'user@example.com', link: 'https://evil.example.net/verify?token=a' },
        { strict: true }
      )
    ).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });
});
