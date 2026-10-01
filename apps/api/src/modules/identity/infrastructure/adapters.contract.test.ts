import { describe, expect, it } from 'vitest';
import { JoseAccessTokens } from '../../../platform/auth/jose-access-tokens.js';
import { FixedClock } from '../../../platform/testing/fakes.js';
import { generateTestSigningKeys } from '../testing/identity-test-harness.js';
import { Argon2PasswordHasher } from './argon2-password-hasher.js';
import {
  CryptoRefreshTokenFactory,
  HmacVerificationCodeFactory,
} from './crypto-token-factories.js';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('produces Argon2id hashes that verify only the right password', async () => {
    const hash = await hasher.hash('afrobeats-vocalist-2026');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify(hash, 'afrobeats-vocalist-2026')).toBe(true);
    expect(await hasher.verify(hash, 'afrobeats-vocalist-2025')).toBe(false);
  });

  it('treats a malformed stored hash as a mismatch, not a crash', async () => {
    expect(await hasher.verify('not-a-hash', 'anything')).toBe(false);
  });
});

describe('JoseAccessTokens', () => {
  const settings = { keyId: 'k1', issuer: 'https://api.test', audience: 'app', ttlSeconds: 900 };

  it('round-trips the principal and rejects expired or foreign tokens', async () => {
    const clock = new FixedClock();
    const tokens = await JoseAccessTokens.create(
      { ...(await generateTestSigningKeys()), ...settings },
      clock,
    );
    const other = await JoseAccessTokens.create(
      { ...(await generateTestSigningKeys()), ...settings },
      clock,
    );
    const principal = {
      userId: '0192a3b4-0000-7000-8000-000000000001',
      sessionId: '0192a3b4-0000-7000-8000-000000000002',
    };

    const issued = await tokens.issue(principal);
    expect(await tokens.verify(issued.token)).toEqual(principal);
    expect(await other.verify(issued.token)).toBeNull();

    clock.advanceSeconds(901);
    expect(await tokens.verify(issued.token)).toBeNull();
  });
});

describe('Token factories', () => {
  it('makes unique refresh tokens and stores only their hash', () => {
    const factory = new CryptoRefreshTokenFactory();
    const first = factory.create();
    const second = factory.create();
    expect(first.token).not.toBe(second.token);
    expect(first.hash).toBe(factory.hashOf(first.token));
    expect(first.hash).not.toContain(first.token);
  });

  it('makes six-digit codes whose hash depends on the server secret', () => {
    const one = new HmacVerificationCodeFactory('pepper-one-0123456789abcdef0123456789');
    const two = new HmacVerificationCodeFactory('pepper-two-0123456789abcdef0123456789');
    const { code, hash } = one.create();
    expect(code).toMatch(/^\d{6}$/);
    expect(one.hashOf(code)).toBe(hash);
    expect(two.hashOf(code)).not.toBe(hash);
  });
});
