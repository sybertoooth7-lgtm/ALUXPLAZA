import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';

const mockGetQueueStats = vi.fn();
const mockIsDisabled = vi.fn();

vi.mock('../src/lib/email-queue.js', () => ({
  getQueueStats: (...args) => mockGetQueueStats(...args),
  isEmailQueueDisabled: () => mockIsDisabled(),
}));

import { buildApp } from './helpers.js'; // adjust to match adminAudit.test.js

import jwt from 'jsonwebtoken';
import { config } from '../src/config.js';

function adminCookie() {
  const token = jwt.sign(
    { sub: 1, email: 'admin@example.com', jti: crypto.randomUUID(), role: 'admin' },
    config.jwtSecret,
    { expiresIn: '2h' }
  );
  return `adminToken=${token}`;
}

describe('GET /api/admin/queue-stats', () => {
  let app;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('returns 401 without a session', async () => {
    const res = await request(app).get('/api/admin/queue-stats');
    expect(res.status).toBe(401);
    expect(mockGetQueueStats).not.toHaveBeenCalled();
  });

  it('reports disabled when the queue is off', async () => {
    mockIsDisabled.mockReturnValue(true);
    const res = await request(app).get('/api/admin/queue-stats').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ disabled: true });
    expect(mockGetQueueStats).not.toHaveBeenCalled();
  });

  it('returns counts when the queue is running', async () => {
    mockIsDisabled.mockReturnValue(false);
    mockGetQueueStats.mockResolvedValue([
      { queuedCount: 3, activeCount: 1, failedCount: 2, totalCount: 40 },
    ]);
    const res = await request(app).get('/api/admin/queue-stats').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      disabled: false,
      queuedCount: 3,
      activeCount: 1,
      failedCount: 2,
      totalCount: 40,
    });
  });

  it('defaults missing counts to 0', async () => {
    mockIsDisabled.mockReturnValue(false);
    mockGetQueueStats.mockResolvedValue([{}]);
    const res = await request(app).get('/api/admin/queue-stats').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      disabled: false,
      queuedCount: 0,
      activeCount: 0,
      failedCount: 0,
      totalCount: 0,
    });
  });

  it('returns 500 when the stats query throws', async () => {
    mockIsDisabled.mockReturnValue(false);
    mockGetQueueStats.mockRejectedValue(new Error('db down'));
    const res = await request(app).get('/api/admin/queue-stats').set('Cookie', adminCookie());
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to load queue stats' });
  });
});