import type { SessionTokens } from '@rt/contracts';
import type { AccessTokenIssuer } from '../../../platform/auth/access-tokens.js';
import type { Clock } from '../../../platform/clock.js';
import { newId } from '../../../platform/ids.js';
import { Session } from '../domain/session.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { IdentitySettings, RefreshTokenFactory } from './ports.js';

/** Starts and rotates sessions and turns them into the token pair the app stores. */
export class SessionIssuer {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly refreshTokens: RefreshTokenFactory,
    private readonly accessTokens: AccessTokenIssuer,
    private readonly clock: Clock,
    private readonly settings: IdentitySettings,
  ) {}

  /** Saves a new session. Call inside the caller's transaction. */
  async start(
    userId: string,
    deviceId: string,
    deviceLabel: string | null = null,
  ): Promise<{ session: Session; refreshToken: string }> {
    const { token, hash } = this.refreshTokens.create();
    const session = Session.start({
      id: newId(),
      userId,
      deviceId,
      refreshTokenHash: hash,
      now: this.clock.now(),
      ttlDays: this.settings.refreshTokenTtlDays,
      deviceLabel,
    });
    await this.sessions.save(session);
    return { session, refreshToken: token };
  }

  async rotate(current: Session): Promise<{ session: Session; refreshToken: string }> {
    const { token, hash } = this.refreshTokens.create();
    const next = current.rotate({
      newId: newId(),
      newRefreshTokenHash: hash,
      now: this.clock.now(),
      ttlDays: this.settings.refreshTokenTtlDays,
    });
    await this.sessions.save(current);
    await this.sessions.save(next);
    return { session: next, refreshToken: token };
  }

  async tokensFor(session: Session, refreshToken: string): Promise<SessionTokens> {
    const access = await this.accessTokens.issue({ userId: session.userId, sessionId: session.id });
    return {
      accessToken: access.token,
      accessTokenExpiresAt: access.expiresAt.toISOString(),
      refreshToken,
      refreshTokenExpiresAt: session.expiresAt.toISOString(),
    };
  }
}
