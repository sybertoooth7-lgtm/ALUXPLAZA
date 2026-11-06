import { describe, it, expect } from 'vitest';
import { scrubUrlForLogging, logSerializers } from '../src/logger.js';

describe('access-log URL scrubbing', () => {
  it('redacts a risk-score share token in the path', () => {
    expect(scrubUrlForLogging('/api/verify/abc123def456')).toBe('/api/verify/[redacted]');
  });

  it('keeps the query string when redacting a path token', () => {
    expect(scrubUrlForLogging('/api/verify/abc123?x=1')).toBe('/api/verify/[redacted]?x=1');
  });

  it('redacts a session jti in the path', () => {
    expect(scrubUrlForLogging('/api/client/sessions/9f8e7d')).toBe(
      '/api/client/sessions/[redacted]'
    );
  });

  it('redacts token-like query parameters but keeps the rest', () => {
    expect(scrubUrlForLogging('/api/x?a=1&token=secret&page=2')).toBe(
      '/api/x?a=1&token=[redacted]&page=2'
    );
  });

  it('leaves ordinary URLs alone', () => {
    expect(scrubUrlForLogging('/api/admin/submissions?page=2&limit=20')).toBe(
      '/api/admin/submissions?page=2&limit=20'
    );
  });
});

describe('request serializer', () => {
  it('scrubs the logged URL and query object', () => {
    const serialized = logSerializers.req({
      method: 'GET',
      originalUrl: '/api/verify/abcd1234?token=zzz',
      headers: { host: 'api.example.com' },
      socket: { remoteAddress: '203.0.113.9', remotePort: 1234 },
      query: { token: 'zzz', page: '2' },
    });

    expect(serialized.url).toBe('/api/verify/[redacted]?token=[redacted]');
    expect(serialized.query).toEqual({ token: '[redacted]', page: '2' });
  });
});
