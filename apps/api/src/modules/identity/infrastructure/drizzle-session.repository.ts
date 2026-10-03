import { and, desc, eq, gt, inArray, isNull, ne } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import { Session, type SessionRevokedReason } from '../domain/session.js';
import type { ActiveDevice, SessionRepository } from '../domain/session.repository.js';
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

  async findById(id: string): Promise<Session | null> {
    const [row] = await this.uow
      .executor()
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);
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

  async revokeOtherFamilies(
    userId: string,
    keepFamilyId: string,
    reason: SessionRevokedReason,
    now: Date,
  ): Promise<void> {
    await this.uow
      .executor()
      .update(sessions)
      .set({ revokedAt: now, revokedReason: reason })
      .where(
        and(
          eq(sessions.userId, userId),
          ne(sessions.familyId, keepFamilyId),
          isNull(sessions.revokedAt),
        ),
      );
  }

  async activeDevices(userId: string, now: Date): Promise<ActiveDevice[]> {
    const db = this.uow.executor();
    const live = await db
      .select({
        familyId: sessions.familyId,
        deviceLabel: sessions.deviceLabel,
        lastActiveAt: sessions.createdAt,
      })
      .from(sessions)
      .where(
        and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)),
      )
      .orderBy(desc(sessions.createdAt));
    if (live.length === 0) return [];
    // A family's first session is the sign-in itself; its id is the family id.
    const firsts = await db
      .select({ id: sessions.id, createdAt: sessions.createdAt })
      .from(sessions)
      .where(
        inArray(
          sessions.id,
          live.map((row) => row.familyId),
        ),
      );
    const signedIn = new Map(firsts.map((row) => [row.id, row.createdAt]));
    return live.map((row) => ({
      ...row,
      signedInAt: signedIn.get(row.familyId) ?? row.lastActiveAt,
    }));
  }

  async revokeAllForUser(userId: string, reason: SessionRevokedReason, now: Date): Promise<void> {
    await this.uow
      .executor()
      .update(sessions)
      .set({ revokedAt: now, revokedReason: reason })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }
}
