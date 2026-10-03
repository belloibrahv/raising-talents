import { eq } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import type { NotificationLog } from '../application/notifications.js';
import { sentNotifications } from './notification.schema.js';

export class DrizzleNotificationLog implements NotificationLog {
  constructor(private readonly uow: DrizzleUnitOfWork) {}

  async wasSent(key: string): Promise<boolean> {
    const rows = await this.uow
      .executor()
      .select({ key: sentNotifications.key })
      .from(sentNotifications)
      .where(eq(sentNotifications.key, key))
      .limit(1);
    return rows.length > 0;
  }

  async markSent(key: string, at: Date): Promise<void> {
    await this.uow
      .executor()
      .insert(sentNotifications)
      .values({ key, sentAt: at })
      .onConflictDoNothing();
  }
}
