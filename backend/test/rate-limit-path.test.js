import { describe, it, expect } from 'vitest';
import { isStatusPath } from '../src/middleware/rate-limit.js';

const reqWith = (originalUrl) => ({ originalUrl });

describe('status-path exemption from the general API limiter', () => {
  it('skips the public status endpoint, with and without a query string', () => {
    expect(isStatusPath(reqWith('/api/status'))).toBe(true);
    expect(isStatusPath(reqWith('/api/status?t=1'))).toBe(true);
    expect(isStatusPath(reqWith('/api/status/'))).toBe(true);
  });

  it('does not skip paths that merely start with the same characters', () => {
    // A string-prefix check exempted these too, so any unauthenticated URL
    // beginning with "/api/status" bypassed the general limiter.
    expect(isStatusPath(reqWith('/api/statusanything'))).toBe(false);
    expect(isStatusPath(reqWith('/api/statuses'))).toBe(false);
    expect(isStatusPath(reqWith('/api/statusanything?x=1'))).toBe(false);
  });
});
