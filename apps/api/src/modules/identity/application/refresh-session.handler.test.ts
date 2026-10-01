import { ErrorCode } from '@rt/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { Account } from '../../accounts/domain/account.js';
import { IdentityEvents } from '../domain/identity.events.js';
import {
  AMAKA,
  createIdentityHarness,
  type IdentityHarness,
} from '../testing/identity-test-harness.js';

describe('RefreshSessionHandler', () => {
  let harness: IdentityHarness;
  let userId: string;
  let firstRefreshToken: string;

  beforeEach(async () => {
    harness = await createIdentityHarness();
    const signedUp = await harness.signUp.execute(AMAKA);
    if (!signedUp.ok) throw new Error(signedUp.error.message);
    userId = signedUp.value.userId;
    firstRefreshToken = signedUp.value.tokens.refreshToken;
  });

  it('swaps a refresh token for a new pair and retires the old one', async () => {
    const result = await harness.refresh.execute({
      refreshToken: firstRefreshToken,
      deviceId: AMAKA.deviceId,
    });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.tokens.refreshToken).not.toBe(firstRefreshToken);
    expect(harness.sessions.activeSessionsFor(userId)).toHaveLength(1);
  });

  it('signs the device out everywhere when an old token is replayed', async () => {
    const rotated = await harness.refresh.execute({
      refreshToken: firstRefreshToken,
      deviceId: AMAKA.deviceId,
    });
    if (!rotated.ok) throw new Error(rotated.error.message);

    const replay = await harness.refresh.execute({
      refreshToken: firstRefreshToken,
      deviceId: AMAKA.deviceId,
    });
    expect(!replay.ok && replay.error.code).toBe(ErrorCode.SessionRevoked);

    const legitimate = await harness.refresh.execute({
      refreshToken: rotated.value.tokens.refreshToken,
      deviceId: AMAKA.deviceId,
    });
    expect(!legitimate.ok && legitimate.error.code).toBe(ErrorCode.SessionRevoked);
    expect(harness.sessions.activeSessionsFor(userId)).toHaveLength(0);
    expect(harness.events.ofType(IdentityEvents.SessionFamilyRevoked)).toHaveLength(1);
  });

  it('revokes the session when the token arrives from another device', async () => {
    const result = await harness.refresh.execute({
      refreshToken: firstRefreshToken,
      deviceId: '0192a3b4-0000-7000-8000-00000000beef',
    });
    expect(!result.ok && result.error.code).toBe(ErrorCode.SessionRevoked);
    expect(harness.sessions.activeSessionsFor(userId)).toHaveLength(0);
  });

  it('expires after 30 days', async () => {
    harness.clock.advanceDays(30);
    const result = await harness.refresh.execute({
      refreshToken: firstRefreshToken,
      deviceId: AMAKA.deviceId,
    });
    expect(!result.ok && result.error.code).toBe(ErrorCode.SessionExpired);
  });

  it('ends every session of an account that gets suspended', async () => {
    const account = await harness.accountRepository.findById(userId);
    if (!account) throw new Error('missing account');
    await harness.accountRepository.save(
      Account.restore({ ...account.snapshot(), status: 'suspended' }),
    );

    const result = await harness.refresh.execute({
      refreshToken: firstRefreshToken,
      deviceId: AMAKA.deviceId,
    });
    expect(!result.ok && result.error.code).toBe(ErrorCode.AccountSuspended);
    expect(harness.sessions.activeSessionsFor(userId)).toHaveLength(0);
  });

  it('sign-out ends the session so its token stops working', async () => {
    await harness.signOut.execute(firstRefreshToken);
    const result = await harness.refresh.execute({
      refreshToken: firstRefreshToken,
      deviceId: AMAKA.deviceId,
    });
    expect(!result.ok && result.error.code).toBe(ErrorCode.SessionRevoked);
  });
});
