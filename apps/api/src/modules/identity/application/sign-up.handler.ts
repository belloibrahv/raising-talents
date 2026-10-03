import type { SessionTokens } from '@rt/contracts';
import type { Clock } from '../../../platform/clock.js';
import type { DomainError } from '../../../platform/domain-error.js';
import type { EventRecorder } from '../../../platform/domain-event.js';
import { newId } from '../../../platform/ids.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import type { CredentialRepository } from '../domain/credential.repository.js';
import { IdentityErrors } from '../domain/identity.errors.js';
import { IdentityEvents } from '../domain/identity.events.js';
import { checkPasswordPolicy } from '../domain/password-policy.js';
import type {
  AccountDirectory,
  BreachedPasswordChecker,
  IdentitySettings,
  PasswordHasher,
} from './ports.js';
import type { SessionIssuer } from './session-issuer.js';

export interface SignUpCommand {
  readonly email: string;
  readonly password: string;
  readonly dateOfBirth: string;
  readonly countryCode: string;
  readonly deviceId: string;
  readonly ip: string;
  readonly deviceLabel?: string | null;
}

export interface SignedIn {
  readonly userId: string;
  readonly tokens: SessionTokens;
}

export const SIGN_UP_LIMIT = { perIp: 10, windowSeconds: 3600 } as const;

/**
 * Creates the account, the password credential and the first session in one
 * transaction, and asks the worker to email a verification code.
 */
export class SignUpHandler {
  constructor(
    private readonly directory: AccountDirectory,
    private readonly credentials: CredentialRepository,
    private readonly hasher: PasswordHasher,
    private readonly breached: BreachedPasswordChecker,
    private readonly issuer: SessionIssuer,
    private readonly events: EventRecorder,
    private readonly rateLimiter: RateLimiter,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly settings: IdentitySettings,
  ) {}

  async execute(command: SignUpCommand): Promise<Result<SignedIn, DomainError>> {
    const limit = await this.rateLimiter.consume(
      `sign-up:ip:${command.ip}`,
      SIGN_UP_LIMIT.perIp,
      SIGN_UP_LIMIT.windowSeconds,
    );
    if (!limit.allowed) return err(IdentityErrors.rateLimited(limit.retryAfterSeconds));

    const policy = checkPasswordPolicy(command.password, command.email);
    if (!policy.ok) return policy;
    if (this.settings.breachedPasswordCheck && (await this.breached.isBreached(command.password))) {
      return err(IdentityErrors.breachedPassword());
    }

    // Hashing is slow on purpose, so it happens before the transaction opens.
    const passwordHash = await this.hasher.hash(command.password);
    const now = this.clock.now();

    const started = await this.uow.run(async () => {
      const created = await this.directory.create({
        id: newId(),
        email: command.email,
        dateOfBirth: command.dateOfBirth,
        countryCode: command.countryCode,
        now,
      });
      if (!created.ok) return created;

      await this.credentials.savePasswordHash(created.value.id, passwordHash, now);
      const session = await this.issuer.start(
        created.value.id,
        command.deviceId,
        command.deviceLabel,
      );
      await this.events.record([
        {
          type: IdentityEvents.EmailVerificationRequested,
          aggregateId: created.value.id,
          occurredAt: now,
          payload: {},
        },
      ]);
      return ok(session);
    });
    if (!started.ok) return started;

    const tokens = await this.issuer.tokensFor(started.value.session, started.value.refreshToken);
    return ok({ userId: started.value.session.userId, tokens });
  }
}
