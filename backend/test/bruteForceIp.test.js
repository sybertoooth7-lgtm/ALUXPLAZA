import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  blockIp: vi.fn(),
  logSecurityEvent: vi.fn(),
}));

vi.mock('../src/db.js', () => ({ default: { query: mocks.query } }));
vi.mock('../src/shield/blocklist.js', () => ({ blockIp: mocks.blockIp }));
vi.mock('../src/shield/eventLogger.js', () => ({ logSecurityEvent: mocks.logSecurityEvent }));

const { recordFailedLogin } = await import('../src/shield/bruteForceGuard.js');

beforeEach(() => {
  mocks.query.mockReset().mockResolvedValue({ rows: [{ total: 1 }] });
  mocks.blockIp.mockReset();
  mocks.logSecurityEvent.mockReset();
});

describe('recordFailedLogin address validation', () => {
  // The counter key and the block target come from req.ip, which a misplaced
  // TRUST_PROXY_HOPS lets a client fill. Counting garbage would give every
  // variation its own bucket, so the threshold would never trip; blocking it
  // would write a non-address into VARCHAR(45).
  it('does not count or block a value that is not an address', async () => {
    for (const value of ['unknown', 'not-an-ip', '1.2.3.4, 5.6.7.8', 'x'.repeat(300), null]) {
      await expect(recordFailedLogin(value)).resolves.toBe(false);
    }
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.blockIp).not.toHaveBeenCalled();
    expect(mocks.logSecurityEvent).not.toHaveBeenCalled();
  });

  it('counts a real IPv4 address', async () => {
    await expect(recordFailedLogin('198.51.100.7')).resolves.toBe(false);
    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls[0][1][0]).toBe('198.51.100.7');
  });

  it('normalises the address before it reaches the counter', async () => {
    await recordFailedLogin('::ffff:198.51.100.7');
    await recordFailedLogin('[2001:db8::1]:443');
    const keys = mocks.query.mock.calls.map((call) => call[1][0]);
    expect(keys).toEqual(['198.51.100.7', '2001:db8::1']);
  });

  it('blocks the normalised address once the threshold is crossed', async () => {
    mocks.query.mockResolvedValue({ rows: [{ total: 5 }] });
    await expect(recordFailedLogin('::ffff:198.51.100.7')).resolves.toBe(true);
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ ip: '198.51.100.7', eventType: 'brute_force' })
    );
    expect(mocks.blockIp).toHaveBeenCalledWith(
      '198.51.100.7',
      expect.any(String),
      'high',
      'brute_force'
    );
  });
});
