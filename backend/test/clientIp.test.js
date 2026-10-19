// How the app works out a visitor's IP behind a reverse proxy: the
// TRUST_PROXY_HOPS setting and the superadmin diagnostic that shows what the
// host actually sends.
import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { parseTrustProxyHops } from '../src/config.js';
import adminDiagnosticsRoutes, { isInternalAddress } from '../src/routes/adminDiagnostics.js';
import { requireAuth } from '../src/middleware/auth.js';
import { requireSuperAdmin } from '../src/middleware/rbac.js';
import db from '../src/db.js';

function buildApp(hops) {
  const app = express();
  app.set('trust proxy', hops);
  app.use(cookieParser());
  app.use('/api/admin/diagnostics', requireAuth, requireSuperAdmin, adminDiagnosticsRoutes);
  return app;
}

async function adminToken(role) {
  const email = `ip-${role}-${crypto.randomUUID().slice(0, 8)}@staff.example.com`;
  const { rows } = await db.query(
    'INSERT INTO admin_users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
    [email, bcrypt.hashSync('irrelevant', 4), role]
  );
  return jwt.sign(
    { sub: rows[0].id, email, role, jti: crypto.randomUUID() },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );
}

const get = (app, token, headers = {}) =>
  request(app)
    .get('/api/admin/diagnostics/client-ip')
    .set({ Cookie: [`adminToken=${token}`], ...headers });

describe('parseTrustProxyHops', () => {
  it('defaults to 1 when unset or empty, so existing behaviour is unchanged', () => {
    expect(parseTrustProxyHops(undefined)).toBe(1);
    expect(parseTrustProxyHops('')).toBe(1);
    expect(parseTrustProxyHops('   ')).toBe(1);
  });

  it('accepts whole numbers from 0 to 5', () => {
    expect(parseTrustProxyHops('0')).toBe(0);
    expect(parseTrustProxyHops('2')).toBe(2);
    expect(parseTrustProxyHops(' 5 ')).toBe(5);
  });

  it('falls back to 1 for anything else, never to "trust everything"', () => {
    for (const bad of ['abc', '-1', '6', '99', '1.5', 'true', 'Infinity']) {
      expect(parseTrustProxyHops(bad)).toBe(1);
    }
  });
});

describe('isInternalAddress', () => {
  it('flags private, loopback, link-local and carrier-grade NAT ranges', () => {
    for (const ip of [
      '10.1.2.3',
      '172.16.0.9',
      '172.31.255.1',
      '192.168.1.5',
      '100.64.0.1',
      '127.0.0.1',
      '169.254.1.1',
      '::1',
      'fd00::1',
      'fe80::1',
    ]) {
      expect(isInternalAddress(ip), ip).toBe(true);
    }
  });

  it('sees through IPv4-mapped IPv6 addresses', () => {
    expect(isInternalAddress('::ffff:10.0.0.5')).toBe(true);
    expect(isInternalAddress('::ffff:203.0.113.9')).toBe(false);
  });

  it('does not flag public addresses, including ones next to private ranges', () => {
    for (const ip of [
      '203.0.113.9',
      '197.232.10.4',
      '172.32.0.1',
      '100.128.0.1',
      '2001:db8::1',
      '8.8.8.8',
    ]) {
      expect(isInternalAddress(ip), ip).toBe(false);
    }
    expect(isInternalAddress(undefined)).toBe(false);
    expect(isInternalAddress('not-an-ip')).toBe(false);
  });
});

describe('GET /api/admin/diagnostics/client-ip — access', () => {
  it('is 401 without a login and 403 for a plain admin', async () => {
    const app = buildApp(1);
    expect((await request(app).get('/api/admin/diagnostics/client-ip')).status).toBe(401);
    expect((await get(app, await adminToken('admin'))).status).toBe(403);
  });
});

describe('GET /api/admin/diagnostics/client-ip — what it reports', () => {
  it('one trusted hop reads the rightmost X-Forwarded-For entry and ignores anything a visitor prepended', async () => {
    const res = await get(buildApp(1), await adminToken('superadmin'), {
      'X-Forwarded-For': '6.6.6.6, 203.0.113.9',
    });
    expect(res.status).toBe(200);
    expect(res.body.detectedIp).toBe('203.0.113.9'); // not the forged 6.6.6.6
    expect(res.body.looksInternal).toBe(false);
    expect(res.body.trustProxyHops).toBe(1);
    expect(res.body.headers['x-forwarded-for']).toBe('6.6.6.6, 203.0.113.9');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('shows the failure the setting exists for: two proxies, one trusted hop, so the app sees the second proxy', async () => {
    // client -> edge proxy -> host proxy -> app: X-Forwarded-For is "client, edge".
    const headers = { 'X-Forwarded-For': '203.0.113.9, 10.8.0.2' };
    const tooLow = await get(buildApp(1), await adminToken('superadmin'), headers);
    expect(tooLow.body.detectedIp).toBe('10.8.0.2');
    expect(tooLow.body.looksInternal).toBe(true);
    expect(tooLow.body.guidance).toMatch(/Raise TRUST_PROXY_HOPS by one/);

    const fixed = await get(buildApp(2), await adminToken('superadmin'), headers);
    expect(fixed.body.detectedIp).toBe('203.0.113.9');
    expect(fixed.body.looksInternal).toBe(false);
    expect(fixed.body.guidance).toMatch(/leave TRUST_PROXY_HOPS alone/);
  });

  it('shows the opposite risk: too many trusted hops lets a visitor forge their address', async () => {
    // One real proxy, but two hops trusted: the visitor's own header wins.
    const res = await get(buildApp(2), await adminToken('superadmin'), {
      'X-Forwarded-For': '6.6.6.6, 203.0.113.9',
    });
    expect(res.body.detectedIp).toBe('6.6.6.6');
  });

  it('with no proxy trusted, ignores X-Forwarded-For entirely', async () => {
    const res = await get(buildApp(0), await adminToken('superadmin'), {
      'X-Forwarded-For': '203.0.113.9',
    });
    expect(res.body.trustProxyHops).toBe(0);
    expect(res.body.detectedIp).not.toBe('203.0.113.9');
    expect(res.body.trustedChain).toEqual([]);
  });

  it('reports the other forwarding headers a host may add, and null for the ones absent', async () => {
    const res = await get(buildApp(1), await adminToken('superadmin'), {
      'X-Forwarded-For': '203.0.113.9',
      'True-Client-IP': '203.0.113.9',
      'CF-Connecting-IP': '203.0.113.9',
    });
    expect(res.body.headers['true-client-ip']).toBe('203.0.113.9');
    expect(res.body.headers['cf-connecting-ip']).toBe('203.0.113.9');
    expect(res.body.headers['x-real-ip']).toBeNull();
    expect(res.body.headers.forwarded).toBeNull();
  });
});
