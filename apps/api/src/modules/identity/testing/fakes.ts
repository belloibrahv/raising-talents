import type { EmailChange, EmailChangeRepository } from '../domain/email-change.js';
import type {
  BreachedPasswordChecker,
  EmailMessage,
  EmailSender,
  PasswordHasher,
} from '../application/ports.js';
import type { CredentialRepository } from '../domain/credential.repository.js';
import { OneTimeCode, type OneTimeCodePurpose } from '../domain/one-time-code.js';
import type { OneTimeCodeRepository } from '../domain/one-time-code.repository.js';
import { Session, type SessionRevokedReason } from '../domain/session.js';
import type { ActiveDevice, SessionRepository } from '../domain/session.repository.js';

export class InMemorySessionRepository implements SessionRepository {
  readonly rows = new Map<string, ReturnType<Session['snapshot']>>();

  async findByRefreshTokenHash(hash: string): Promise<Session | null> {
    const row = [...this.rows.values()].find((candidate) => candidate.refreshTokenHash === hash);
    return row ? Session.restore(row) : null;
  }

  async save(session: Session): Promise<void> {
    this.rows.set(session.id, session.snapshot());
  }

  async revokeFamily(familyId: string, reason: SessionRevokedReason, now: Date): Promise<void> {
    for (const [id, row] of this.rows) {
      if (row.familyId === familyId && row.revokedAt === null) {
        this.rows.set(id, { ...row, revokedAt: now, revokedReason: reason });
      }
    }
  }

  async revokeAllForUser(userId: string, reason: SessionRevokedReason, now: Date): Promise<void> {
    for (const [id, row] of this.rows) {
      if (row.userId === userId && row.revokedAt === null) {
        this.rows.set(id, { ...row, revokedAt: now, revokedReason: reason });
      }
    }
  }

  async findById(id: string): Promise<Session | null> {
    const row = this.rows.get(id);
    return row ? Session.restore(row) : null;
  }

  async revokeOtherFamilies(
    userId: string,
    keepFamilyId: string,
    reason: SessionRevokedReason,
    now: Date,
  ): Promise<void> {
    for (const [id, row] of this.rows) {
      if (row.userId === userId && row.familyId !== keepFamilyId && row.revokedAt === null) {
        this.rows.set(id, { ...row, revokedAt: now, revokedReason: reason });
      }
    }
  }

  async activeDevices(userId: string, now: Date): Promise<ActiveDevice[]> {
    const mine = [...this.rows.values()].filter((row) => row.userId === userId);
    return mine
      .filter((row) => row.revokedAt === null && row.expiresAt > now)
      .map((row) => ({
        familyId: row.familyId,
        deviceLabel: row.deviceLabel,
        signedInAt: new Date(
          Math.min(
            ...mine
              .filter((other) => other.familyId === row.familyId)
              .map((other) => other.createdAt.getTime()),
          ),
        ),
        lastActiveAt: row.createdAt,
      }))
      .sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime());
  }

  activeSessionsFor(userId: string) {
    return [...this.rows.values()].filter((row) => row.userId === userId && row.revokedAt === null);
  }
}

export class InMemoryCredentialRepository implements CredentialRepository {
  readonly hashes = new Map<string, string>();

  async findPasswordHash(userId: string): Promise<string | null> {
    return this.hashes.get(userId) ?? null;
  }

  async savePasswordHash(userId: string, passwordHash: string): Promise<void> {
    this.hashes.set(userId, passwordHash);
  }
}

export class InMemoryOneTimeCodeRepository implements OneTimeCodeRepository {
  readonly rows = new Map<string, ReturnType<OneTimeCode['snapshot']>>();

  async findLatest(userId: string, purpose: OneTimeCodePurpose): Promise<OneTimeCode | null> {
    const latest = [...this.rows.values()]
      .filter((row) => row.userId === userId && row.purpose === purpose)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return latest ? OneTimeCode.restore(latest) : null;
  }

  async save(code: OneTimeCode): Promise<void> {
    const props = code.snapshot();
    this.rows.set(props.id, props);
  }
}

/** Fast and obviously fake. The real Argon2 adapter has its own contract test. */
export class FakePasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return `fake-hash:${password}`;
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    return passwordHash === `fake-hash:${password}`;
  }
}

export class FakeBreachedPasswordChecker implements BreachedPasswordChecker {
  constructor(private readonly breached: ReadonlySet<string> = new Set(['password1234'])) {}

  async isBreached(password: string): Promise<boolean> {
    return this.breached.has(password);
  }
}

export class CapturingEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  failNext = false;

  async send(message: EmailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('SMTP connection refused');
    }
    this.sent.push(message);
  }

  lastCodeFor(email: string): string | undefined {
    const message = [...this.sent].reverse().find((candidate) => candidate.to === email);
    return message?.text.match(/\b(\d{6})\b/)?.[1];
  }
}

export class InMemoryEmailChangeRepository implements EmailChangeRepository {
  readonly rows = new Map<string, EmailChange>();

  async find(userId: string): Promise<EmailChange | null> {
    return this.rows.get(userId) ?? null;
  }

  async save(change: EmailChange): Promise<void> {
    this.rows.set(change.userId, change);
  }

  async remove(userId: string): Promise<void> {
    this.rows.delete(userId);
  }
}
