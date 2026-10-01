import type { Clock } from '../../../platform/clock.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { RefreshTokenFactory } from './ports.js';

/** Ends one device's session. Unknown or already-ended tokens are ignored. */
export class SignOutHandler {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly refreshTokens: RefreshTokenFactory,
    private readonly clock: Clock,
  ) {}

  async execute(refreshToken: string): Promise<void> {
    const session = await this.sessions.findByRefreshTokenHash(
      this.refreshTokens.hashOf(refreshToken),
    );
    if (!session) return;
    session.revoke('signed_out', this.clock.now());
    await this.sessions.save(session);
  }
}
