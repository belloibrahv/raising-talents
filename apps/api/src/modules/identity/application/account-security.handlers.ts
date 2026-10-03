import type { ChangePassword, SignedInDevices } from '@rt/contracts';
import type { Clock } from '../../../platform/clock.js';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import type { EventRecorder } from '../../../platform/domain-event.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import type { CredentialRepository } from '../domain/credential.repository.js';
import { IdentityErrors } from '../domain/identity.errors.js';
import { IdentityEvents } from '../domain/identity.events.js';
import { checkPasswordPolicy } from '../domain/password-policy.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type {
  AccountDirectory,
  BreachedPasswordChecker,
  IdentitySettings,
  PasswordHasher,
} from './ports.js';

/** Who is asking, from their access token: the account and the session that issued it. */
export interface Principal {
  readonly userId: string;
  readonly sessionId: string;
}

export const CHANGE_PASSWORD_LIMIT = { perUser: 5, windowSeconds: 900 } as const;

/** The device behind the access token: the family of the session that issued it. */
async function currentFamily(
  sessions: SessionRepository,
  principal: Principal,
): Promise<string | null> {
  return (await sessions.findById(principal.sessionId))?.familyId ?? null;
}

export class ListDevicesQuery {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(principal: Principal): Promise<SignedInDevices> {
    const [devices, current] = await Promise.all([
      this.sessions.activeDevices(principal.userId, this.clock.now()),
      currentFamily(this.sessions, principal),
    ]);
    return {
      items: devices.map((device) => ({
        id: device.familyId,
        device: device.deviceLabel,
        signedInAt: device.signedInAt.toISOString(),
        lastActiveAt: device.lastActiveAt.toISOString(),
        current: device.familyId === current,
      })),
    };
  }
}

/**
 * Signs out one device. Someone else's device id, or one already signed out, changes
 * nothing and answers the same, so ids cannot be probed.
 */
export class SignOutDeviceHandler {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(principal: Principal, familyId: string): Promise<void> {
    const first = await this.sessions.findById(familyId);
    if (first?.userId !== principal.userId) return;
    await this.sessions.revokeFamily(familyId, 'signed_out', this.clock.now());
  }
}

export class SignOutOtherDevicesHandler {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
  ) {}

  async execute(principal: Principal): Promise<void> {
    const keep = await currentFamily(this.sessions, principal);
    if (!keep) return;
    await this.sessions.revokeOtherFamilies(principal.userId, keep, 'signed_out', this.clock.now());
  }
}

/**
 * Changes the password with the current one as proof. Other devices are signed out,
 * since a changed password often means someone else knew the old one, and the owner
 * gets the same "password changed" email as after a reset.
 */
export class ChangePasswordHandler {
  constructor(
    private readonly directory: AccountDirectory,
    private readonly credentials: CredentialRepository,
    private readonly sessions: SessionRepository,
    private readonly hasher: PasswordHasher,
    private readonly breached: BreachedPasswordChecker,
    private readonly events: EventRecorder,
    private readonly rateLimiter: RateLimiter,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly settings: IdentitySettings,
  ) {}

  async execute(principal: Principal, input: ChangePassword): Promise<Result<void, DomainError>> {
    const limit = await this.rateLimiter.consume(
      `change-password:${principal.userId}`,
      CHANGE_PASSWORD_LIMIT.perUser,
      CHANGE_PASSWORD_LIMIT.windowSeconds,
    );
    if (!limit.allowed) return err(IdentityErrors.rateLimited(limit.retryAfterSeconds));

    const [account, hash] = await Promise.all([
      this.directory.findById(principal.userId),
      this.credentials.findPasswordHash(principal.userId),
    ]);
    if (!account || !hash || !(await this.hasher.verify(hash, input.currentPassword))) {
      return err(domainError('INVALID_CREDENTIALS', 'Your current password is not right.'));
    }
    if (input.newPassword === input.currentPassword) {
      return err(IdentityErrors.weakPassword('Choose a password different from the current one.'));
    }
    const policy = checkPasswordPolicy(input.newPassword, account.email);
    if (!policy.ok) return policy;
    if (
      this.settings.breachedPasswordCheck &&
      (await this.breached.isBreached(input.newPassword))
    ) {
      return err(IdentityErrors.breachedPassword());
    }

    const newHash = await this.hasher.hash(input.newPassword);
    const keep = await currentFamily(this.sessions, principal);
    return this.uow.run(async () => {
      const now = this.clock.now();
      await this.credentials.savePasswordHash(principal.userId, newHash, now);
      if (keep) {
        await this.sessions.revokeOtherFamilies(principal.userId, keep, 'password_changed', now);
      } else {
        await this.sessions.revokeAllForUser(principal.userId, 'password_changed', now);
      }
      await this.events.record([
        {
          type: IdentityEvents.PasswordChanged,
          aggregateId: principal.userId,
          occurredAt: now,
          payload: {},
        },
      ]);
      return ok(undefined);
    });
  }
}
