import { createHash, createHmac, randomBytes, randomInt } from 'node:crypto';
import { VERIFICATION_CODE_LENGTH } from '@rt/contracts';
import type { RefreshTokenFactory, VerificationCodeFactory } from '../application/ports.js';

/** 256-bit random refresh tokens. Only the SHA-256 hash is stored. */
export class CryptoRefreshTokenFactory implements RefreshTokenFactory {
  create(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: this.hashOf(token) };
  }

  hashOf(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}

/**
 * Six-digit codes. A plain hash of six digits can be reversed in milliseconds,
 * so codes are hashed with a server-side secret (HMAC-SHA256).
 */
export class HmacVerificationCodeFactory implements VerificationCodeFactory {
  constructor(private readonly pepper: string) {}

  create(): { code: string; hash: string } {
    const code = randomInt(0, 10 ** VERIFICATION_CODE_LENGTH)
      .toString()
      .padStart(VERIFICATION_CODE_LENGTH, '0');
    return { code, hash: this.hashOf(code) };
  }

  hashOf(code: string): string {
    return createHmac('sha256', this.pepper).update(code).digest('hex');
  }
}
