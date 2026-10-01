import { ErrorCode } from '@rt/contracts';
import { describe, expect, it } from 'vitest';
import { CODE_MAX_ATTEMPTS, OneTimeCode } from './one-time-code.js';

const now = new Date('2026-10-01T09:00:00.000Z');
const later = (seconds: number) => new Date(now.getTime() + seconds * 1000);
const issue = () =>
  OneTimeCode.issue({
    id: 'code-1',
    userId: 'user-1',
    purpose: 'email_verification',
    codeHash: 'right',
    now,
  });

describe('OneTimeCode', () => {
  it('accepts the right code once', () => {
    const code = issue();
    expect(code.attempt('right', later(30)).ok).toBe(true);
    const again = code.attempt('right', later(31));
    expect(!again.ok && again.error.code).toBe(ErrorCode.VerificationCodeExpired);
  });

  it('counts wrong guesses and locks after the maximum', () => {
    const code = issue();
    for (let attempt = 1; attempt < CODE_MAX_ATTEMPTS; attempt += 1) {
      const result = code.attempt('wrong', later(attempt));
      expect(!result.ok && result.error.code).toBe(ErrorCode.VerificationCodeInvalid);
    }
    const last = code.attempt('wrong', later(10));
    expect(!last.ok && last.error.code).toBe(ErrorCode.VerificationAttemptsExceeded);
    const evenRight = code.attempt('right', later(11));
    expect(!evenRight.ok && evenRight.error.code).toBe(ErrorCode.VerificationAttemptsExceeded);
    expect(code.snapshot().attempts).toBe(CODE_MAX_ATTEMPTS);
  });

  it('expires after ten minutes', () => {
    const result = issue().attempt('right', later(10 * 60));
    expect(!result.ok && result.error.code).toBe(ErrorCode.VerificationCodeExpired);
  });

  it('tells how long to wait before a resend', () => {
    const code = issue();
    expect(code.secondsUntilResendAllowed(later(15))).toBe(45);
    expect(code.secondsUntilResendAllowed(later(60))).toBe(0);
  });
});
