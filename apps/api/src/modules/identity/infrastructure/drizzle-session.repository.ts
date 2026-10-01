import { and, eq, isNull } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import { Session, type SessionRevokedReason } from '../domain/session.js';
import type { SessionRepository } from '../domain/session.repository.js';
import { sessions } from './identity.schema.js';

export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly uow: DrizzleUnitOfWork) {}

  async findByRefreshTokenHash(
    hash: string,
    options: { lock?: boolean } = {},
  ): Promise<Session | null> {
    const query = this.uow
      .executor()
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, hash))
      .limit(1);
    const [row] = options.lock ? await query.for('update') : await query;
    return row ? Session.restore(row) : null;
  }

  async save(session: Session): Promise<void> {
    const props = session.snapshot();
    await this.uow
      .executor()
      .insert(sessions)
      .values(props)
      .onConflictDoUpdate({
        target: sessions.id,
        set: { revokedAt: props.revokedAt, revokedReason: props.revokedReason },
      });
  }

  async revokeFamily(familyId: string, reason: SessionRevokedReason, now: Date): Promise<void> {
    await this.uow
      .executor()
      .update(sessions)
      .set({ revokedAt: now, revokedReason: reason })
      .where(and(eq(sessions.familyId, familyId), isNull(sessions.revokedAt)));
  }
}
