import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock('../src/db.js', () => ({ default: { query } }));

import { logSecurityEvent } from '../src/shield/eventLogger.js';

const insertedValues = () => query.mock.calls[0][1];

beforeEach(() => {
  query.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logSecurityEvent', () => {
  it('clips request-derived fields to their column widths', async () => {
    const long = 'a'.repeat(1000);

    await logSecurityEvent({
      ip: '198.51.100.7',
      eventType: 'sqli',
      severity: 'high',
      path: `/api/x?q=${long}`,
      method: 'M'.repeat(40),
      matchedPattern: long,
      snippet: long,
      blocked: true,
    });

    expect(query).toHaveBeenCalledTimes(1);
    const values = insertedValues();
    expect(values[3]).toHaveLength(500);
    expect(values[3].startsWith('/api/x?q=')).toBe(true);
    expect(values[4]).toHaveLength(10);
    expect(values[5]).toHaveLength(255);
    // payload_snippet is TEXT and is deliberately not clipped.
    expect(values[6]).toHaveLength(1000);
    expect(values[7]).toBe(true);
  });

  it('passes values that already fit through unchanged', async () => {
    await logSecurityEvent({
      ip: '198.51.100.7',
      eventType: 'xss',
      severity: 'high',
      path: '/api/contact',
      method: 'POST',
      matchedPattern: 'xss_script_tag',
      snippet: '<script>alert(1)</script>',
      blocked: true,
    });

    expect(insertedValues()).toEqual([
      '198.51.100.7',
      'xss',
      'high',
      '/api/contact',
      'POST',
      'xss_script_tag',
      '<script>alert(1)</script>',
      true,
    ]);
  });

  it('logs and swallows a failed insert instead of throwing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    query.mockRejectedValueOnce(new Error('value too long'));

    await expect(
      logSecurityEvent({ ip: '198.51.100.7', eventType: 'sqli' })
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    expect(errorSpy.mock.calls[0].join(' ')).toContain('value too long');
  });
});
