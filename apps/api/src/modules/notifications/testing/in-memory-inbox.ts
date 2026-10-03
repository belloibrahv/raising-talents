import type { Inbox, InboxEntry } from '../application/inbox.js';

export class InMemoryInbox implements Inbox {
  readonly entries: InboxEntry[] = [];

  add(entry: InboxEntry): Promise<void> {
    if (!this.entries.some((existing) => existing.key === entry.key)) this.entries.push(entry);
    return Promise.resolve();
  }

  page(
    userId: string,
    after: { createdAt: Date; id: string } | null,
    limit: number,
  ): Promise<InboxEntry[]> {
    const older = (entry: InboxEntry) =>
      !after ||
      entry.createdAt < after.createdAt ||
      (entry.createdAt.getTime() === after.createdAt.getTime() && entry.id < after.id);
    return Promise.resolve(this.mine(userId).filter(older).slice(0, limit));
  }

  unread(userId: string): Promise<number> {
    return Promise.resolve(this.mine(userId).filter((entry) => entry.readAt === null).length);
  }

  markAllRead(userId: string, now: Date): Promise<void> {
    this.entries.forEach((entry, index) => {
      if (entry.userId === userId && entry.readAt === null) {
        this.entries[index] = { ...entry, readAt: now };
      }
    });
    return Promise.resolve();
  }

  all(userId: string): Promise<InboxEntry[]> {
    return Promise.resolve(this.mine(userId));
  }

  pruneBefore(date: Date): Promise<number> {
    const before = this.entries.length;
    const kept = this.entries.filter((entry) => entry.createdAt >= date);
    this.entries.splice(0, this.entries.length, ...kept);
    return Promise.resolve(before - kept.length);
  }

  private mine(userId: string): InboxEntry[] {
    return this.entries
      .filter((entry) => entry.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id));
  }
}
