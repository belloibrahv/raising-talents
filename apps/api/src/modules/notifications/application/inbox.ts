import { NOTIFICATIONS_PAGE_SIZE, type Notification, type NotificationPage } from '@rt/contracts';
import type { Logger } from 'pino';
import type { Clock } from '../../../platform/clock.js';
import { decodeCursor, encodeCursor } from '../../../platform/cursor.js';

type Content<N> = N extends Notification ? Omit<N, 'id' | 'createdAt' | 'read'> : never;

/** What a notice says, without its id or read state: the kind and that kind's details. */
export type NoticeContent = Content<Notification>;

export interface InboxEntry {
  readonly id: string;
  /** The event that caused it, so a redelivered event adds nothing. */
  readonly key: string;
  readonly userId: string;
  readonly content: NoticeContent;
  readonly createdAt: Date;
  readonly readAt: Date | null;
}

export interface Inbox {
  /** Does nothing when an entry with the same key exists. */
  add(entry: InboxEntry): Promise<void>;
  /** Newest first. */
  page(
    userId: string,
    after: { createdAt: Date; id: string } | null,
    limit: number,
  ): Promise<InboxEntry[]>;
  unread(userId: string): Promise<number>;
  markAllRead(userId: string, now: Date): Promise<void>;
  all(userId: string): Promise<InboxEntry[]>;
  /** Deletes entries created before the date and returns how many went. */
  pruneBefore(date: Date): Promise<number>;
}

/** Notices are kept this long, read or not (ADR-032). */
export const INBOX_RETENTION_DAYS = 180;

const view = (entry: InboxEntry): Notification =>
  ({
    ...entry.content,
    id: entry.id,
    createdAt: entry.createdAt.toISOString(),
    read: entry.readAt !== null,
  });

export class ListNotificationsQuery {
  constructor(private readonly inbox: Inbox) {}

  async execute(userId: string, cursor?: string): Promise<NotificationPage> {
    const after = decodeCursor(cursor);
    const [rows, unread] = await Promise.all([
      this.inbox.page(
        userId,
        after ? { createdAt: after.at, id: after.id } : null,
        NOTIFICATIONS_PAGE_SIZE + 1,
      ),
      this.inbox.unread(userId),
    ]);
    const page = rows.slice(0, NOTIFICATIONS_PAGE_SIZE);
    const last = page.at(-1);
    return {
      items: page.map(view),
      unread,
      nextCursor:
        rows.length > NOTIFICATIONS_PAGE_SIZE && last
          ? encodeCursor(last.createdAt, last.id)
          : null,
    };
  }
}

export class UnreadCountQuery {
  constructor(private readonly inbox: Inbox) {}

  async execute(userId: string): Promise<{ unread: number }> {
    return { unread: await this.inbox.unread(userId) };
  }
}

export class MarkNotificationsReadHandler {
  constructor(
    private readonly inbox: Inbox,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string): Promise<void> {
    await this.inbox.markAllRead(userId, this.clock.now());
  }
}

/** The person's notices for their data export (ADR-027). */
export class NotificationsExport {
  constructor(private readonly inbox: Inbox) {}

  async forUser(userId: string): Promise<Notification[]> {
    return (await this.inbox.all(userId)).map(view);
  }
}

/** Daily, in the worker: drops notices past the retention period. */
export class InboxPruneJob {
  readonly name = 'notifications.prune';
  readonly everySeconds = 86_400;

  constructor(
    private readonly inbox: Inbox,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async run(): Promise<void> {
    const cutoff = new Date(this.clock.now().getTime() - INBOX_RETENTION_DAYS * 86_400_000);
    const removed = await this.inbox.pruneBefore(cutoff);
    if (removed > 0) this.logger.info({ removed }, 'old notices pruned');
  }
}
