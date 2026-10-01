import { ErrorCode } from '@rt/contracts';
import { describe, expect, it } from 'vitest';
import { Account } from './account.js';
import { AccountEvents } from './account.events.js';

const now = new Date('2026-10-01T09:00:00.000Z');
const register = (dateOfBirth: string) =>
  Account.register({
    id: '0192a3b4-0000-7000-8000-000000000001',
    email: 'tunde.bakare@example.com',
    dateOfBirth,
    countryCode: 'NG',
    now,
  });

describe('Account age gate', () => {
  it('accepts someone who turns 18 today', () => {
    expect(register('2008-10-01').ok).toBe(true);
  });

  it('rejects someone whose 18th birthday is tomorrow', () => {
    const result = register('2008-10-02');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.UnderMinimumAge);
  });

  it('rejects dates that do not exist and dates in the future', () => {
    for (const dateOfBirth of ['2003-02-30', '2030-01-01', '17-04-2001']) {
      const result = register(dateOfBirth);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe(ErrorCode.ValidationFailed);
    }
  });

  it('starts in onboarding with no role and records AccountCreated', () => {
    const result = register('2001-04-17');
    if (!result.ok) throw new Error('expected success');
    expect(result.value.snapshot()).toMatchObject({
      status: 'onboarding',
      role: null,
      emailVerifiedAt: null,
    });
    expect(result.value.pullEvents().map((event) => event.type)).toEqual([
      AccountEvents.AccountCreated,
    ]);
  });
});

describe('Account role choice', () => {
  const verifiedAccount = () => {
    const result = register('2001-04-17');
    if (!result.ok) throw new Error('expected success');
    result.value.markEmailVerified(now);
    result.value.pullEvents();
    return result.value;
  };

  it('needs a verified email first', () => {
    const result = register('2001-04-17');
    if (!result.ok) throw new Error('expected success');
    const chosen = result.value.selectRole('agent', now);
    expect(chosen.ok).toBe(false);
    if (!chosen.ok) expect(chosen.error.code).toBe(ErrorCode.EmailNotVerified);
  });

  it('can change the role until it is locked', () => {
    const account = verifiedAccount();
    expect(account.selectRole('talent', now).ok).toBe(true);
    expect(account.selectRole('agent', now).ok).toBe(true);
    expect(account.snapshot().role).toBe('agent');
    expect(
      account.pullEvents().filter((event) => event.type === AccountEvents.RoleSelected),
    ).toHaveLength(2);
  });

  it('refuses a change once the role is locked', () => {
    const account = Account.restore({
      ...verifiedAccount().snapshot(),
      role: 'talent',
      roleLockedAt: now,
    });
    const result = account.selectRole('agent', now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe(ErrorCode.RoleAlreadyLocked);
  });
});

describe('Account sign-in status', () => {
  it('blocks suspended and banned accounts', () => {
    const result = register('2001-04-17');
    if (!result.ok) throw new Error('expected success');
    const base = result.value.snapshot();
    const suspended = Account.restore({ ...base, status: 'suspended' }).ensureCanSignIn();
    const banned = Account.restore({ ...base, status: 'banned' }).ensureCanSignIn();
    expect(!suspended.ok && suspended.error.code).toBe(ErrorCode.AccountSuspended);
    expect(!banned.ok && banned.error.code).toBe(ErrorCode.AccountBanned);
  });
});
