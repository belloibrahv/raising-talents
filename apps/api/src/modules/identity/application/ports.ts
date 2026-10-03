import type { DomainError } from '../../../platform/domain-error.js';
import type { Result } from '../../../platform/result.js';

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
}

export interface BreachedPasswordChecker {
  /** True when the password appears in known data breaches. */
  isBreached(password: string): Promise<boolean>;
}

/** Creates high-entropy refresh tokens and the hash we store for them. */
export interface RefreshTokenFactory {
  create(): { token: string; hash: string };
  hashOf(token: string): string;
}

/** Creates numeric codes and their keyed hash. */
export interface VerificationCodeFactory {
  create(): { code: string; hash: string };
  hashOf(code: string): string;
}

export type { EmailMessage, EmailSender } from '../../../platform/email/email-sender.js';

export interface DirectoryAccount {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
}

/** What identity needs from the accounts module, shaped by identity. */
export interface AccountDirectory {
  create(input: {
    id: string;
    email: string;
    dateOfBirth: string;
    countryCode: string;
    now: Date;
  }): Promise<Result<DirectoryAccount, DomainError>>;
  findByEmail(email: string): Promise<DirectoryAccount | null>;
  findById(id: string): Promise<DirectoryAccount | null>;
  ensureCanSignIn(userId: string): Promise<Result<void, DomainError>>;
  markEmailVerified(userId: string): Promise<Result<void, DomainError>>;
}

export interface IdentitySettings {
  readonly refreshTokenTtlDays: number;
  readonly breachedPasswordCheck: boolean;
}
