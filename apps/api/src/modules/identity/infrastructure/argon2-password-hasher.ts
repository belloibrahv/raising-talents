import { hash, verify } from '@node-rs/argon2';
import type { PasswordHasher } from '../application/ports.js';

// The library exports its algorithm list as a const enum, which isolated modules cannot read.
// 2 is Argon2id in that enum.
const ARGON2ID = 2;

/** Argon2id with the OWASP minimum: 19 MiB memory, 2 iterations, 1 lane. */
const OPTIONS = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export class Argon2PasswordHasher implements PasswordHasher {
  hash(password: string): Promise<string> {
    return hash(password, OPTIONS);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
