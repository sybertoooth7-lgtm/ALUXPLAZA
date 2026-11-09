import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The guard modules are replaced so these tests describe shield's decisions,
// not the database. In particular they pin down what happens when the write
// that records a block fails.
const mocks = vi.hoisted(() => ({
  isBlocked: vi.fn(),
  blockIp: vi.fn(),
  recordRequest: vi.fn(),
  corroborateSignatureMatch: vi.fn(),
  scanRequest: vi.fn(),
  logSecurityEvent: vi.fn(),
}));

vi.mock('../src/shield/blocklist.js', () => ({
  isBlocked: mocks.isBlocked,
  blockIp: mocks.blockIp,
}));
vi.mock('../src/shield/bruteForceGuard.js', () => ({
  recordRequest: mocks.recordRequest,
  corroborateSignatureMatch: mocks.corroborateSignatureMatch,
}));
vi.mock('../src/shield/detector.js', () => ({ scanRequest: mocks.scanRequest }));
vi.mock('../src/shield/eventLogger.js', () => ({ logSecurityEvent: mocks.logSecurityEvent }));

import { shield } from '../src/middleware/shieldMiddleware.js';

const DETECTION = {
  eventType: 'sqli',
  matchedPattern: 'sql_union',
  severity: 'high',
  snippet: 'union select',
};

function makeReq(overrides = {}) {
  return {
    ip: '198.51.100.7',
    socket: { remoteAddress: '198.51.100.7' },
    path: '/api/x',
    originalUrl: '/api/x',
    method: 'GET',
    headers: {},
    ...overrides,
  };
}

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isBlocked.mockResolvedValue(false);
  mocks.recordRequest.mockResolvedValue(false);
  mocks.corroborateSignatureMatch.mockResolvedValue(true);
  mocks.blockIp.mockResolvedValue(undefined);
  mocks.logSecurityEvent.mockResolvedValue(undefined);
  mocks.scanRequest.mockReturnValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shield fail-open guard', () => {
  it('still refuses a detected attack when persisting the block fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.scanRequest.mockReturnValue(DETECTION);
    mocks.blockIp.mockRejectedValue(new Error('insert failed'));

    const next = vi.fn();
    const res = makeRes();
    await shield(makeReq(), res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('never blocks or looks up an unattributable address', async () => {
    mocks.scanRequest.mockReturnValue(DETECTION);

    const next = vi.fn();
    const res = makeRes();
    // req.ip is not an address and the socket is the host's own proxy, so
    // there is no visitor to attribute this request to.
    await shield(makeReq({ ip: 'not-an-ip', socket: { remoteAddress: '10.0.0.5' } }), res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.isBlocked).not.toHaveBeenCalled();
    expect(mocks.blockIp).not.toHaveBeenCalled();
    expect(mocks.recordRequest).toHaveBeenCalledWith('unknown', null);
  });

  it('uses the validated address, not the raw header value', async () => {
    mocks.scanRequest.mockReturnValue(DETECTION);
    mocks.blockIp.mockRejectedValue(new Error('insert failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = makeRes();
    await shield(
      makeReq({ ip: 'evil.example.com', socket: { remoteAddress: '203.0.113.9' } }),
      res,
      vi.fn()
    );

    expect(mocks.isBlocked).toHaveBeenCalledWith('203.0.113.9');
    expect(mocks.blockIp).toHaveBeenCalledWith(
      '203.0.113.9',
      'sqli: sql_union',
      'high',
      'sqli'
    );
  });

  it('denies the first match but does not persist a block until corroborated', async () => {
    mocks.scanRequest.mockReturnValue(DETECTION);
    mocks.corroborateSignatureMatch.mockResolvedValue(false);

    const next = vi.fn();
    const res = makeRes();
    await shield(makeReq(), res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
    // The request is refused, but a single planted match must not be enough
    // to ban the address (or everyone behind its NAT).
    expect(mocks.blockIp).not.toHaveBeenCalled();
  });

  it('lets a clean request through', async () => {
    const next = vi.fn();
    const res = makeRes();
    await shield(makeReq(), res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBeNull();
  });
});
