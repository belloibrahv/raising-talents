import { and, count, desc, eq, lt, or } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import type { ShortlistEntry, ShortlistRepository } from '../domain/shortlist.js';
import { shortlistEntries } from './shortlist.schema.js';

export class DrizzleShortlistRepository implements ShortlistRepository {
  constructor(private readonly uow: DrizzleUnitOfWork) {}

  async find(agentId: string, talentId: string): Promise<ShortlistEntry | null> {
    const [row] = await this.uow
      .executor()
      .select()
      .from(shortlistEntries)
      .where(and(eq(shortlistEntries.agentId, agentId), eq(shortlistEntries.talentId, talentId)))
      .limit(1);
    return row ?? null;
  }

  async save(entry: ShortlistEntry): Promise<ShortlistEntry> {
    const [row] = await this.uow
      .executor()
      .insert(shortlistEntries)
      .values(entry)
      .onConflictDoUpdate({
        target: [shortlistEntries.agentId, shortlistEntries.talentId],
        // saved_at is left alone: the first save is the one that counts.
        set: { note: entry.note, updatedAt: entry.updatedAt },
      })
      .returning();
    if (!row) throw new Error('shortlist save returned no row');
    return row;
  }

  async remove(agentId: string, talentId: string): Promise<void> {
    await this.uow
      .executor()
      .delete(shortlistEntries)
      .where(and(eq(shortlistEntries.agentId, agentId), eq(shortlistEntries.talentId, talentId)));
  }

  async count(agentId: string): Promise<number> {
    const [row] = await this.uow
      .executor()
      .select({ total: count() })
      .from(shortlistEntries)
      .where(eq(shortlistEntries.agentId, agentId));
    return row?.total ?? 0;
  }

  async page(
    agentId: string,
    after: { savedAt: Date; talentId: string } | null,
    limit: number,
  ): Promise<ShortlistEntry[]> {
    const mine = eq(shortlistEntries.agentId, agentId);
    return this.uow
      .executor()
      .select()
      .from(shortlistEntries)
      .where(
        after
          ? and(
              mine,
              or(
                lt(shortlistEntries.savedAt, after.savedAt),
                and(
                  eq(shortlistEntries.savedAt, after.savedAt),
                  lt(shortlistEntries.talentId, after.talentId),
                ),
              ),
            )
          : mine,
      )
      .orderBy(desc(shortlistEntries.savedAt), desc(shortlistEntries.talentId))
      .limit(limit);
  }

  async all(agentId: string): Promise<ShortlistEntry[]> {
    return this.uow
      .executor()
      .select()
      .from(shortlistEntries)
      .where(eq(shortlistEntries.agentId, agentId))
      .orderBy(desc(shortlistEntries.savedAt));
  }
}
