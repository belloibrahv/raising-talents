import { ErrorCode } from '@rt/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { IdentityEvents } from '../domain/identity.events.js';
import {
  AMAKA,
  createIdentityHarness,
  type IdentityHarness,
} from '../testing/identity-test-harness.js';

const aDifferentCode = (code: string | undefined) =>
  String((Number(code ?? 0) + 1) % 1_000_000).padStart(6, '0');

describe('Email verification', () => {
  let harness: IdentityHarness;
  let userId: string;

  const deliverPendingRequests = async () => {
    for (const event of harness.events.ofType(IdentityEvents.EmailVerificationRequested)) {
      await harness.issueCode.handle(event);
    }
  };

  beforeEach(async () => {
    harness = await createIdentityHarness();
    const signedUp = await harness.signUp.execute(AMAKA);
    if (!signedUp.ok) throw new Error(signedUp.error.message);
    userId = signedUp.value.userId;
  });

  it('emails a six-digit code that verifies the account', async () => {
    await deliverPendingRequests();
    const code = harness.email.lastCodeFor(AMAKA.email);
    expect(code).toMatch(/^\d{6}$/);

    const result = await harness.verifyEmail.execute({ userId, code: code ?? '' });
    expect(result.ok).toBe(true);
    const me = await harness.accounts.getMe(userId);
    expect(me.ok && me.value.emailVerified).toBe(true);
  });

  it('does not email twice when the worker sees the same event again', async () => {
    await deliverPendingRequests();
    await deliverPendingRequests();
    expect(harness.email.sent).toHaveLength(1);
  });

  it('retries after a failed send and stores no unusable code', async () => {
    harness.email.failNext = true;
    await expect(deliverPendingRequests()).rejects.toThrow('SMTP');
    expect(harness.codes.rows.size).toBe(0);

    await deliverPendingRequests();
    expect(harness.email.sent).toHaveLength(1);
    expect(harness.codes.rows.size).toBe(1);
  });

  it('keeps count of wrong codes even though each request fails', async () => {
    await deliverPendingRequests();
    const wrong = await harness.verifyEmail.execute({
      userId,
      code: aDifferentCode(harness.email.lastCodeFor(AMAKA.email)),
    });
    expect(!wrong.ok && wrong.error.code).toBe(ErrorCode.VerificationCodeInvalid);
    expect([...harness.codes.rows.values()][0]?.attempts).toBe(1);
  });

  it('makes people wait a minute between resends', async () => {
    await deliverPendingRequests();
    const tooSoon = await harness.requestVerification.execute(userId);
    expect(!tooSoon.ok && tooSoon.error.code).toBe(ErrorCode.VerificationResendTooSoon);

    harness.clock.advanceSeconds(61);
    expect((await harness.requestVerification.execute(userId)).ok).toBe(true);
    await deliverPendingRequests();
    expect(harness.email.sent).toHaveLength(2);
  });

  it('only the newest code works after a resend', async () => {
    await deliverPendingRequests();
    const firstCode = harness.email.lastCodeFor(AMAKA.email) ?? '';
    harness.clock.advanceSeconds(61);
    await harness.requestVerification.execute(userId);
    await deliverPendingRequests();
    const secondCode = harness.email.lastCodeFor(AMAKA.email) ?? '';

    if (firstCode !== secondCode) {
      const old = await harness.verifyEmail.execute({ userId, code: firstCode });
      expect(old.ok).toBe(false);
    }
    expect((await harness.verifyEmail.execute({ userId, code: secondCode })).ok).toBe(true);
  });
});
