import { ErrorCode } from '@rt/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../../accounts/domain/account.js';
import {
  AMAKA,
  createIdentityHarness,
  type IdentityHarness,
} from '../testing/identity-test-harness.js';

describe('SignInHandler', () => {
  let harness: IdentityHarness;
  let userId: string;

  beforeEach(async () => {
    harness = await createIdentityHarness();
    const signedUp = await harness.signUp.execute(AMAKA);
    if (!signedUp.ok) throw new Error(signedUp.error.message);
    userId = signedUp.value.userId;
  });

  it('starts a new session with the right password', async () => {
    const result = await harness.signIn.execute(AMAKA);
    expect(result.ok).toBe(true);
    expect(harness.sessions.activeSessionsFor(userId)).toHaveLength(2);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await harness.signIn.execute({
      ...AMAKA,
      password: 'not-the-right-one-at-all',
    });
    const unknownEmail = await harness.signIn.execute({ ...AMAKA, email: 'nobody@example.com' });
    expect(!wrongPassword.ok && wrongPassword.error).toEqual(
      !unknownEmail.ok && unknownEmail.error,
    );
    expect(!wrongPassword.ok && wrongPassword.error.code).toBe(ErrorCode.InvalidCredentials);
  });

  it('keeps suspended accounts out', async () => {
    const account = await harness.accountRepository.findById(userId);
    if (!account) throw new Error('missing account');
    await harness.accountRepository.save(
      Account.restore({ ...account.snapshot(), status: 'suspended' }),
    );

    const result = await harness.signIn.execute(AMAKA);
    expect(!result.ok && result.error.code).toBe(ErrorCode.AccountSuspended);
  });

  it('limits attempts per email address', async () => {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await harness.signIn.execute({
        ...AMAKA,
        password: 'guessing-wrong-again',
        ip: `10.0.0.${attempt}`,
      });
    }
    const result = await harness.signIn.execute({ ...AMAKA, ip: '10.0.0.99' });
    expect(!result.ok && result.error.code).toBe(ErrorCode.RateLimited);
  });
});
