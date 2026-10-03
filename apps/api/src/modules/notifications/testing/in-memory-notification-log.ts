import type { NotificationLog } from '../application/notifications.js';

export class InMemoryNotificationLog implements NotificationLog {
  readonly sent = new Map<string, Date>();
  async wasSent(key: string): Promise<boolean> {
    return this.sent.has(key);
  }
  async markSent(key: string, at: Date): Promise<void> {
    this.sent.set(key, at);
  }
}
