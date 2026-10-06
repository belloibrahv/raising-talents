import { ErrorCode } from '@rt/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { IdentityEvents } from '../domain/identity.events.js';
import { AccountEvents } from '../../accounts/domain/account.events.js';
import {
  AMAKA,
  createIdentityHarness,
  type IdentityHarness,
} from '../testing/identity-test-harness.js';

describe('SignUpHandler', () => {
  let harness: IdentityHarness;
  beforeEach(async () => {
    harness = await createIdentityHarness();
  });

  it('creates the account, credential and first session, and asks for a verification email', async () => {
    const result = await harness.signUp.execute(AMAKA);
    if (!result.ok) throw new Error(result.error.message);

    const account = await harness.accountRepository.findByEmail(AMAKA.email);
    expect(account?.snapshot()).toMatchObject({
      status: 'onboarding',
      countryCode: 'NG',
      emailVerifiedAt: null,
    });
    expect(await harness.credentials.findPasswordHash(result.value.userId)).toBeTruthy();
    expect(harness.sessions.activeSessionsFor(result.value.userId)).toHaveLength(1);
    expect(harness.events.ofType(AccountEvents.AccountCreated)).toHaveLength(1);
    expect(harness.events.ofType(IdentityEvents.EmailVerificationRequested)).toHaveLength(1);
    expect(result.value.tokens.refreshToken.length).toBeGreaterThanOrEqual(43);
  });

  it('never stores the refresh token itself', async () => {
    const result = await harness.signUp.execute(AMAKA);
    if (!result.ok) throw new Error(result.error.message);
    const stored = harness.sessions.activeSessionsFor(result.value.userId)[0];
    expect(stored?.refreshTokenHash).not.toBe(result.value.tokens.refreshToken);
    expect(stored?.refreshTokenHash).toBe(
      harness.refreshTokens.hashOf(result.value.tokens.refreshToken),
    );
  });

  it('turns away under-18s without creating anything', async () => {
    const result = await harness.signUp.execute({ ...AMAKA, dateOfBirth: '2010-01-01' });
    expect(!result.ok && result.error.code).toBe(ErrorCode.UnderMinimumAge);
    expect(harness.accountRepository.rows.size).toBe(0);
    expect(harness.credentials.hashes.size).toBe(0);
    expect(harness.sessions.rows.size).toBe(0);
  });

  it('refuses a second account with the same email', async () => {
    await harness.signUp.execute(AMAKA);
    const second = await harness.signUp.execute({ ...AMAKA, password: 'another-long-password-9' });
    expect(!second.ok && second.error.code).toBe(ErrorCode.EmailAlreadyRegistered);
  });

  it('refuses a password found in data breaches', async () => {
    const result = await harness.signUp.execute({ ...AMAKA, password: 'password1234' });
    expect(!result.ok && result.error.code).toBe(ErrorCode.WeakPassword);
  });

  it('verifies the account at once and sends nothing when verification is off (ADR-045)', async () => {
    const off = await createIdentityHarness({ emailVerification: 'off' });
    const result = await off.signUp.execute(AMAKA);
    if (!result.ok) throw new Error(result.error.message);
    const account = await off.accountRepository.findByEmail(AMAKA.email);
    expect(account?.snapshot().emailVerifiedAt).not.toBeNull();
    expect(off.events.ofType(IdentityEvents.EmailVerificationRequested)).toHaveLength(0);
  });

  it('limits sign-ups from one IP address', async () => {
    for (let index = 0; index < 10; index += 1) {
      await harness.signUp.execute({ ...AMAKA, email: `scout${index}@example.com` });
    }
    const eleventh = await harness.signUp.execute({ ...AMAKA, email: 'scout10@example.com' });
    expect(!eleventh.ok && eleventh.error.code).toBe(ErrorCode.RateLimited);
  });
});
