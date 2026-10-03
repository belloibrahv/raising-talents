import { and, count, desc, eq, isNull, lt, or } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import type { Inbox, InboxEntry, NoticeContent } from '../application/inbox.js';
import { inboxNotices } from './notification.schema.js';

type Row = typeof inboxNotices.$inferSelect;

const toEntry = (row: Row): InboxEntry => ({
  id: row.id,
  key: row.key,
  userId: row.userId,
  content: { ...(row.data as object), kind: row.kind } as NoticeContent,
  createdAt: row.createdAt,
  readAt: row.readAt,
});

export class DrizzleInbox implements Inbox {
  constructor(private readonly uow: DrizzleUnitOfWork) {}

  async add(entry: InboxEntry): Promise<void> {
    const { kind, ...data } = entry.content;
    await this.uow
      .executor()
      .insert(inboxNotices)
      .values({
        id: entry.id,
        key: entry.key,
        userId: entry.userId,
        kind,
        data,
        createdAt: entry.createdAt,
        readAt: entry.readAt,
      })
      .onConflictDoNothing({ target: inboxNotices.key });
  }

  async page(
    userId: string,
    after: { createdAt: Date; id: string } | null,
    limit: number,
  ): Promise<InboxEntry[]> {
    const mine = eq(inboxNotices.userId, userId);
    const rows = await this.uow
      .executor()
      .select()
      .from(inboxNotices)
      .where(
        after
          ? and(
              mine,
              or(
                lt(inboxNotices.createdAt, after.createdAt),
                and(eq(inboxNotices.createdAt, after.createdAt), lt(inboxNotices.id, after.id)),
              ),
            )
          : mine,
      )
      .orderBy(desc(inboxNotices.createdAt), desc(inboxNotices.id))
      .limit(limit);
    return rows.map(toEntry);
  }

  async unread(userId: string): Promise<number> {
    const [row] = await this.uow
      .executor()
      .select({ total: count() })
      .from(inboxNotices)
      .where(and(eq(inboxNotices.userId, userId), isNull(inboxNotices.readAt)));
    return row?.total ?? 0;
  }

  async markAllRead(userId: string, now: Date): Promise<void> {
    await this.uow
      .executor()
      .update(inboxNotices)
      .set({ readAt: now })
      .where(and(eq(inboxNotices.userId, userId), isNull(inboxNotices.readAt)));
  }

  async all(userId: string): Promise<InboxEntry[]> {
    const rows = await this.uow
      .executor()
      .select()
      .from(inboxNotices)
      .where(eq(inboxNotices.userId, userId))
      .orderBy(desc(inboxNotices.createdAt));
    return rows.map(toEntry);
  }

  async pruneBefore(date: Date): Promise<number> {
    const removed = await this.uow
      .executor()
      .delete(inboxNotices)
      .where(lt(inboxNotices.createdAt, date))
      .returning({ id: inboxNotices.id });
    return removed.length;
  }
}
