import { describe, it, expect } from 'vitest';
import { computeTOTP, generateBackupCodes, verifyBackupCode, matchTOTPStep } from '../src/lib/mfa.js';

describe('MFA backup codes', () => {
  it('generates ten 80-bit, correctly formatted codes', async () => {
    const { plaintextCodes, hashedCodes } = await generateBackupCodes();

    expect(plaintextCodes).toHaveLength(10);
    expect(new Set(plaintextCodes).size).toBe(10);
    for (const code of plaintextCodes) {
      expect(code).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    }
    expect(await verifyBackupCode(plaintextCodes[0], hashedCodes)).toBe(0);
    expect(await verifyBackupCode('AAAA-AAAA-AAAA-AAAA', hashedCodes)).toBe(-1);
  }, 30_000);
});

describe('TOTP step matching', () => {
  it('returns the time-step that produced the code', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const code = computeTOTP(secret, 0);
    const nowStep = Math.floor(Date.now() / 1000 / 30);
    // The call can straddle a 30-second boundary; accept the adjacent step.
    expect([nowStep - 1, nowStep, nowStep + 1]).toContain(matchTOTPStep(secret, code));
  });

  it('returns null for a wrong code', () => {
    expect(matchTOTPStep('JBSWY3DPEHPK3PXP', '000000')).toBeNull();
  });
});
