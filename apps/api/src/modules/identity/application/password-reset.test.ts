import { beforeEach, describe, expect, it } from 'vitest';
import { IdentityEvents } from '../domain/identity.events.js';
import {
  AMAKA,
  createIdentityHarness,
  type IdentityHarness,
} from '../testing/identity-test-harness.js';

const NEW_PASSWORD = 'free-kick-top-corner-ibadan';

describe('Password reset', () => {
  let harness: IdentityHarness;
  let refreshToken: string;

  /** What the worker does with the outbox. */
  const deliver = async () => {
    for (const event of harness.events.ofType(IdentityEvents.PasswordResetRequested).splice(0)) {
      await harness.issueResetCode.handle(event);
    }
    for (const event of harness.events.ofType(IdentityEvents.PasswordChanged)) {
      await harness.notifyPasswordChanged.handle(event);
    }
    harness.events.events.length = 0;
  };

  const request = (email: string = AMAKA.email) =>
    harness.requestReset.execute({ email, ip: AMAKA.ip });

  beforeEach(async () => {
    harness = await createIdentityHarness();
    const signedUp = await harness.signUp.execute(AMAKA);
    if (!signedUp.ok) throw new Error(signedUp.error.message);
    refreshToken = signedUp.value.tokens.refreshToken;
    harness.events.events.length = 0;
  });

  it('emails a code, sets the new password with it, and signs out every session', async () => {
    expect((await request()).ok).toBe(true);
    await deliver();
    const code = harness.email.lastCodeFor(AMAKA.email);
    expect(harness.email.sent.at(-1)?.subject).toBe(
      `${code ?? ''} is your Raising Talents reset code`,
    );

    const reset = await harness.resetPassword.execute({
      email: AMAKA.email,
      code: code ?? '',
      newPassword: NEW_PASSWORD,
    });
    expect(reset.ok).toBe(true);

    const oldPassword = await harness.signIn.execute({
      email: AMAKA.email,
      password: AMAKA.password,
      deviceId: AMAKA.deviceId,
      ip: AMAKA.ip,
    });
    expect(oldPassword.ok ? null : oldPassword.error.code).toBe('INVALID_CREDENTIALS');
    const newPassword = await harness.signIn.execute({
      email: AMAKA.email,
      password: NEW_PASSWORD,
      deviceId: AMAKA.deviceId,
      ip: AMAKA.ip,
    });
    expect(newPassword.ok).toBe(true);

    const oldSession = await harness.refresh.execute({ refreshToken, deviceId: AMAKA.deviceId });
    expect(oldSession.ok ? null : oldSession.error.code).toBe('SESSION_REVOKED');

    await deliver();
    expect(harness.email.sent.at(-1)?.subject).toBe('Your Raising Talents password was changed');
  });

  it('answers an unknown email exactly like a known one, and sends nothing', async () => {
    const unknown = await request('nobody.here@example.com');
    expect(unknown).toEqual(await request());
    await deliver();
    expect(
      harness.email.sent.filter((message) => message.to === 'nobody.here@example.com'),
    ).toEqual([]);
  });

  it('keeps the code when the new password is refused, so the person can try a better one', async () => {
    await request();
    await deliver();
    const code = harness.email.lastCodeFor(AMAKA.email) ?? '';
    const weak = await harness.resetPassword.execute({
      email: AMAKA.email,
      code,
      newPassword: 'short',
    });
    expect(weak.ok ? null : weak.error.code).toBe('WEAK_PASSWORD');
    expect(
      (await harness.resetPassword.execute({ email: AMAKA.email, code, newPassword: NEW_PASSWORD }))
        .ok,
    ).toBe(true);
  });

  it('counts wrong codes, refuses a used one, and gives the same answer for an account with no code', async () => {
    await request();
    await deliver();
    const code = harness.email.lastCodeFor(AMAKA.email) ?? '';
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    const guess = await harness.resetPassword.execute({
      email: AMAKA.email,
      code: wrong,
      newPassword: NEW_PASSWORD,
    });
    expect(guess.ok ? null : guess.error.code).toBe('VERIFICATION_CODE_INVALID');

    expect(
      (await harness.resetPassword.execute({ email: AMAKA.email, code, newPassword: NEW_PASSWORD }))
        .ok,
    ).toBe(true);
    const again = await harness.resetPassword.execute({
      email: AMAKA.email,
      code,
      newPassword: `${NEW_PASSWORD}-2`,
    });
    expect(again.ok ? null : again.error.code).toBe('VERIFICATION_CODE_EXPIRED');

    const noAccount = await harness.resetPassword.execute({
      email: 'nobody.here@example.com',
      code,
      newPassword: NEW_PASSWORD,
    });
    expect(noAccount.ok ? null : noAccount.error.code).toBe('VERIFICATION_CODE_EXPIRED');
  });

  it('sends one code for requests close together, and limits requests per address', async () => {
    await request();
    await request();
    await deliver();
    // The worker drops a request whose code was already sent after it was made.
    const resetEmails = () =>
      harness.email.sent.filter((message) => message.subject.endsWith('reset code'));
    expect(resetEmails()).toHaveLength(1);
    harness.clock.advanceSeconds(61);
    await request();
    await request();
    await request();
    const sixth = await request();
    expect(sixth.ok ? null : sixth.error.code).toBe('RATE_LIMITED');
  });

  it('verifies the email too, since the code proved the person reads it', async () => {
    const before = await harness.accounts.getMe(
      (await harness.accounts.findSummaryByEmail(AMAKA.email))?.id ?? '',
    );
    expect(before.ok && before.value.emailVerified).toBe(false);
    await request();
    await deliver();
    await harness.resetPassword.execute({
      email: AMAKA.email,
      code: harness.email.lastCodeFor(AMAKA.email) ?? '',
      newPassword: NEW_PASSWORD,
    });
    const after = await harness.accounts.getMe(
      (await harness.accounts.findSummaryByEmail(AMAKA.email))?.id ?? '',
    );
    expect(after.ok && after.value.emailVerified).toBe(true);
  });
});
