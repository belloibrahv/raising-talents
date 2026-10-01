import type { Clock } from '../../../platform/clock.js';
import type { DomainError } from '../../../platform/domain-error.js';
import type { EventRecorder } from '../../../platform/domain-event.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import { IdentityErrors } from '../domain/identity.errors.js';
import { IdentityEvents } from '../domain/identity.events.js';
import type { Session, SessionRevokedReason } from '../domain/session.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { AccountDirectory, RefreshTokenFactory } from './ports.js';
import type { SessionIssuer } from './session-issuer.js';
import type { SignedIn } from './sign-up.handler.js';

export interface RefreshSessionCommand {
  readonly refreshToken: string;
  readonly deviceId: string;
}

type RefreshOutcome =
  | { kind: 'rotated'; session: Session; refreshToken: string }
  | { kind: 'rejected'; error: DomainError };

/**
 * Swaps a refresh token for a new pair. Security decisions (revoking a family)
 * are committed even when the request fails, so they are returned as outcomes
 * inside the transaction rather than as failed Results.
 */
export class RefreshSessionHandler {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly refreshTokens: RefreshTokenFactory,
    private readonly directory: AccountDirectory,
    private readonly issuer: SessionIssuer,
    private readonly events: EventRecorder,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(command: RefreshSessionCommand): Promise<Result<SignedIn, DomainError>> {
    const hash = this.refreshTokens.hashOf(command.refreshToken);

    const outcome = await this.uow.run(async (): Promise<RefreshOutcome> => {
      const session = await this.sessions.findByRefreshTokenHash(hash, { lock: true });
      if (!session) return { kind: 'rejected', error: IdentityErrors.sessionExpired() };

      const now = this.clock.now();
      const check = session.checkRefresh(command.deviceId, now);
      switch (check.kind) {
        case 'reused':
          return this.revokeFamily(session, 'reuse_detected', now);
        case 'device_mismatch':
          return this.revokeFamily(session, 'device_mismatch', now);
        case 'revoked':
          return { kind: 'rejected', error: IdentityErrors.sessionRevoked() };
        case 'expired':
          return { kind: 'rejected', error: IdentityErrors.sessionExpired() };
        case 'usable':
          break;
      }

      const allowed = await this.directory.ensureCanSignIn(session.userId);
      if (!allowed.ok) {
        await this.sessions.revokeFamily(session.familyId, 'account_blocked', now);
        return { kind: 'rejected', error: allowed.error };
      }

      const rotated = await this.issuer.rotate(session);
      return { kind: 'rotated', ...rotated };
    });

    if (outcome.kind === 'rejected') return err(outcome.error);
    const tokens = await this.issuer.tokensFor(outcome.session, outcome.refreshToken);
    return ok({ userId: outcome.session.userId, tokens });
  }

  private async revokeFamily(
    session: Session,
    reason: SessionRevokedReason,
    now: Date,
  ): Promise<RefreshOutcome> {
    await this.sessions.revokeFamily(session.familyId, reason, now);
    await this.events.record([
      {
        type: IdentityEvents.SessionFamilyRevoked,
        aggregateId: session.userId,
        occurredAt: now,
        payload: { familyId: session.familyId, reason },
      },
    ]);
    return { kind: 'rejected', error: IdentityErrors.sessionRevoked() };
  }
}
