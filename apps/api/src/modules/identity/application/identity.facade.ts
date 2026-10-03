import type { Clock } from '../../../platform/clock.js';
import type { CredentialRepository } from '../domain/credential.repository.js';
import type { SessionRepository } from '../domain/session.repository.js';
import type { PasswordHasher } from './ports.js';

/** What other modules may ask of identity. */
export class IdentityFacade {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionRepository,
    private readonly clock: Clock,
  ) {}

  /** For confirming a serious action, such as deleting the account, with the current password. */
  async passwordMatches(userId: string, password: string): Promise<boolean> {
    const hash = await this.credentials.findPasswordHash(userId);
    return hash !== null && (await this.hasher.verify(hash, password));
  }

  /**
   * Ends every session of a suspended or banned account. Joins the caller's transaction.
   * Access tokens already issued still work until they expire (ACCESS_TOKEN_TTL_SECONDS).
   */
  async signOutBlocked(userId: string): Promise<void> {
    await this.sessions.revokeAllForUser(userId, 'account_blocked', this.clock.now());
  }
}
