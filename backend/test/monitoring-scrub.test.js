import { describe, it, expect } from 'vitest';
import { scrubValue } from '../src/monitoring.js';

describe('Sentry event scrubbing', () => {
  it('redacts credential-bearing keys', () => {
    const out = scrubValue({
      email: 'person@example.com',
      password: 'hunter2',
      authorization: 'Bearer abc.def.ghi',
      cookie: 'adminToken=secret',
    });
    expect(out).toEqual({
      email: '[redacted]',
      password: '[redacted]',
      authorization: '[redacted]',
      cookie: '[redacted]',
    });
  });

  it('redacts emails, tokens and JWTs inside free text and URLs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJlMTIz';
    const out = scrubValue({
      note: `write to person@example.com with ${jwt}`,
      url: 'https://app.example/verify?token=abc123&email=person@example.com',
      header: 'Authorization: Bearer abc.def.ghi',
    });

    expect(out.note).not.toContain('person@example.com');
    expect(out.note).not.toContain(jwt);
    expect(out.note).toContain('[email]');
    expect(out.note).toContain('[token]');
    expect(out.url).toContain('token=[redacted]');
    expect(out.url).not.toContain('person@example.com');
    expect(out.header).not.toContain('abc.def.ghi');
  });

  it('redacts tokens carried in URL paths', () => {
    const out = scrubValue({
      verifyUrl: 'https://api.example.com/api/verify/abc123def456',
      sessionUrl: 'https://api.example.com/api/client/sessions/9f8e7d6c',
      page: 'https://app.example.com/client/reset-password/abc123def456',
    });

    expect(out.verifyUrl).toBe('https://api.example.com/api/verify/[redacted]');
    expect(out.sessionUrl).toBe('https://api.example.com/api/client/sessions/[redacted]');
    expect(out.page).toBe('https://app.example.com/client/reset-password/[redacted]');
  });

  it('does not recurse without bound', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: { h: { i: 'x' } } } } } } } } };
    const out = scrubValue(deep);
    expect(JSON.stringify(out)).toContain('[truncated]');
  });
});
