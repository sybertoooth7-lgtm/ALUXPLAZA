import { Resend } from 'resend';
import { config } from '../config.js';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Verification and reset links are always server-built (via buildLink() in
// clientAuth.js, from config.frontendUrl + a fixed path), never taken from
// user input, so this isn't closing a real injection path today. It's
// cheap defense-in-depth against a future call site accidentally passing
// something unexpected — but the hostname must be derived from
// config.frontendUrl, not hardcoded, or this silently breaks every
// verification/reset email the moment the app is deployed to a different
// domain (a previous version of this check hardcoded 'jinarous.vercel.app'
// and would have done exactly that).
//
// https: is required in production. In non-production (FRONTEND_URL like
// http://localhost:3000), http: is also allowed — otherwise this check
// fails before sendVerificationEmail()/sendPasswordResetEmail() ever reach
// their "RESEND_API_KEY not set, link would be: ..." dev-mode fallback log,
// so local testing could never see the real link at all.
function isSafeLink(link) {
  try {
    const configuredHost = new URL(config.frontendUrl || '').hostname;
    const url = new URL(link);
    const protocolOk = config.isProduction
      ? url.protocol === 'https:'
      : /^https?:$/.test(url.protocol);
    return protocolOk && !!configuredHost && url.hostname === configuredHost;
  } catch {
    return false;
  }
}

// Thrown when Resend reports that a message was not accepted.
//
// The Resend v4 SDK does NOT throw on API-level failures: emails.send()
// resolves with { data, error } and only throws for programmer errors. So a
// rejected send (422 invalid address, 429, 5xx) looks exactly like a success
// unless the error field is inspected explicitly. That is easy to miss, and
// it matters: without it the pg-boss worker marks a failed send complete and
// never retries, which is the exact failure this queue exists to prevent.
class EmailDeliveryError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'EmailDeliveryError';
    this.cause = cause;
  }
}

// Sends via Resend and throws if the message was rejected. Used by the
// `strict` paths so a delivery failure propagates to the pg-boss worker.
async function sendOrThrow(payload) {
  const result = await resend.emails.send(payload);
  if (result?.error) {
    const detail = result.error.message || result.error.name || 'unknown error';
    throw new EmailDeliveryError(`Resend rejected the message: ${detail}`, result.error);
  }
  return result;
}

// Sends an email, throwing on failure only when `strict` is set.
//
// Non-strict (the default) keeps the historical behaviour of logging and
// resolving, because the inline call sites in clientAuth.js, contact.js and
// loginAudit.js are fire-and-forget or run behind a try/catch, and Node exits
// on an unhandled rejection. Strict is what registerEmailWorker passes in
// index.js, because pg-boss can only retry a send it sees fail.
export async function sendContactNotification(
  { name = 'Unknown', company = '', email = '', message = '', id = '' } = {},
  { strict = false } = {}
) {
  if (!resend) {
    console.log('[email] RESEND_API_KEY not set — skipping notification.');
    return;
  }
  if (!FROM_EMAIL) {
    console.log('[email] FROM_EMAIL not set — skipping notification.');
    return;
  }
  if (!ADMIN_EMAIL) {
    console.log('[email] ADMIN_EMAIL not set — skipping notification.');
    return;
  }

  const safeMessage = typeof message === 'string' ? message : String(message || '');
  const htmlMessage = escapeHtml(safeMessage).replace(/\n/g, '<br/>');
  const safeName = escapeHtml(name);
  const safeCompany = escapeHtml(company || '');
  const safeEmail = escapeHtml(email);
  const safeId = escapeHtml(String(id));

  try {
    await sendOrThrow({
      from: `Alux Plaza <${FROM_EMAIL}>`,
      to: [ADMIN_EMAIL],
      subject: `New contact form submission #${safeId}`,
      html: `
        <h2>New Contact Submission</h2>
        <p><strong>From:</strong> ${safeName} (${safeEmail})</p>
        ${safeCompany ? `<p><strong>Company:</strong> ${safeCompany}</p>` : ''}
        <p><strong>ID:</strong> ${safeId}</p>
        <hr/>
        <p>${htmlMessage}</p>
      `,
      text: `From: ${name}${company ? ` (${company})` : ''} (${email})\n\nMessage:\n${safeMessage}`,
    });
  } catch (err) {
    console.error('[email] error sending contact notification:', err);
    if (strict) throw err;
  }
}

export async function sendVerificationEmail(
  { email = '', link = '' } = {},
  { strict = false } = {}
) {
  if (!email || !link) {
    console.log('[email] Missing recipient or link — skipping verification email.');
    return;
  }
  if (!isSafeLink(link)) {
    console.error(
      '[email] Refusing to send verification email: link does not match FRONTEND_URL.',
      { link }
    );
    return;
  }
  if (!resend) {
    console.log(
      `[email] RESEND_API_KEY not set — skipping verification email. Link would be: ${link}`
    );
    return;
  }
  if (!FROM_EMAIL) {
    console.log('[email] FROM_EMAIL not set — skipping verification email.');
    return;
  }

  const safeUrl = escapeHtml(link);

  try {
    await sendOrThrow({
      from: `Alux Plaza <${FROM_EMAIL}>`,
      to: [email],
      subject: 'Verify your Alux Plaza account',
      html: `
        <h2>Welcome to Alux Plaza</h2>
        <p>Click the link below to verify your email and activate your account:</p>
        <p><a href="${safeUrl}">${safeUrl}</a></p>
        <p>This link expires in 24 hours. If you didn't sign up for Alux Plaza, you can ignore this email.</p>
      `,
      text: `Welcome to Alux Plaza\n\nVerify your email: ${link}\n\nThis link expires in 24 hours. If you didn't sign up for Alux Plaza, you can ignore this email.`,
    });
  } catch (err) {
    console.error('[email] error sending verification email:', err);
    if (strict) throw err;
  }
}

export async function sendPasswordResetEmail(
  { email = '', link = '' } = {},
  { strict = false } = {}
) {
  if (!email || !link) {
    console.log('[email] Missing recipient or link — skipping password reset email.');
    return;
  }
  if (!isSafeLink(link)) {
    console.error(
      '[email] Refusing to send password reset email: link does not match FRONTEND_URL.',
      { link }
    );
    return;
  }
  if (!resend) {
    console.log(
      `[email] RESEND_API_KEY not set — skipping password reset email. Link would be: ${link}`
    );
    return;
  }
  if (!FROM_EMAIL) {
    console.log('[email] FROM_EMAIL not set — skipping password reset email.');
    return;
  }

  const safeUrl = escapeHtml(link);

  try {
    await sendOrThrow({
      from: `Alux Plaza Security <${FROM_EMAIL}>`,
      to: [email],
      subject: 'Reset your Alux Plaza password',
      html: `
        <h2>Password Reset Request</h2>
        <p>We received a request to reset your Alux Plaza password. Click below to choose a new one:</p>
        <p><a href="${safeUrl}">${safeUrl}</a></p>
        <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password will not change.</p>
      `,
      text: `Password Reset Request\n\nReset your password: ${link}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`,
    });
  } catch (err) {
    console.error('[email] error sending password reset email:', err);
    if (strict) throw err;
  }
}

export async function sendNewDeviceAlert(
  { email = '', ip = '', userAgent = '' } = {},
  { strict = false } = {}
) {
  if (!resend) {
    console.log('[email] RESEND_API_KEY not set — skipping new-device alert.');
    return;
  }
  if (!FROM_EMAIL) {
    console.log('[email] FROM_EMAIL not set — skipping new-device alert.');
    return;
  }
  if (!email) {
    console.log('[email] No recipient email — skipping new-device alert.');
    return;
  }

  const safeEmail = escapeHtml(email);
  const safeIp = escapeHtml(ip || 'unknown');
  const safeUserAgent = escapeHtml(userAgent || 'unknown');
  const when = new Date().toUTCString();

  try {
    await sendOrThrow({
      from: `Alux Plaza Security <${FROM_EMAIL}>`,
      to: [email],
      subject: 'New login from an unfamiliar device',
      html: `
        <h2>New Device Login</h2>
        <p>We noticed a login to your Alux Plaza account from a device or location we haven't seen before.</p>
        <p><strong>Time:</strong> ${when}</p>
        <p><strong>IP address:</strong> ${safeIp}</p>
        <p><strong>Device:</strong> ${safeUserAgent}</p>
        <hr/>
        <p>If this was you, no action is needed. If you don't recognize this activity, please change your password immediately and contact support.</p>
      `,
      text: `New device login detected for ${safeEmail}\nTime: ${when}\nIP: ${safeIp}\nDevice: ${safeUserAgent}\n\nIf this wasn't you, change your password immediately and contact support.`,
    });
  } catch (err) {
    console.error('[email] error sending new-device alert:', err);
    if (strict) throw err;
  }
}
