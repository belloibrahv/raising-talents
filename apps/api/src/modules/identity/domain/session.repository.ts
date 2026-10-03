import type { Session, SessionRevokedReason } from './session.js';

export interface SessionRepository {
  /** With lock: true the row is locked until the transaction ends, so two refreshes cannot both win. */
  findByRefreshTokenHash(hash: string, options?: { lock?: boolean }): Promise<Session | null>;
  save(session: Session): Promise<void>;
  revokeFamily(familyId: string, reason: SessionRevokedReason, now: Date): Promise<void>;
  /** Ends every session the person has, on every device. */
  revokeAllForUser(userId: string, reason: SessionRevokedReason, now: Date): Promise<void>;
}
