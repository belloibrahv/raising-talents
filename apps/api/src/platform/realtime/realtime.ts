import type { Redis } from 'ioredis';
import type { Logger } from 'pino';

/**
 * A nudge for a signed-in person's open tabs: something changed, fetch it again (ADR-041).
 * Events never carry content, so a missed one costs nothing but a short delay: the
 * clients still poll, more slowly, and every read goes through the usual checks.
 */
export type RealtimeEvent =
  | { readonly type: 'conversation'; readonly conversationId: string }
  | { readonly type: 'notifications' };

export interface Realtime {
  /** Best effort: a failure is logged and swallowed, never failing the write that caused it. */
  publish(userIds: readonly string[], event: RealtimeEvent): Promise<void>;
  /** Returns the function that stops listening. */
  subscribe(userId: string, listener: (event: RealtimeEvent) => void): Promise<() => void>;
}

const channelOf = (userId: string) => `rt:user:${userId}`;

/**
 * Redis pub/sub, so a write handled by one API instance reaches tabs connected to another.
 * One subscriber connection per process, subscribed only to the people connected here.
 */
export class RedisRealtime implements Realtime {
  private subscriber: Redis | null = null;
  private readonly listeners = new Map<string, Set<(event: RealtimeEvent) => void>>();

  constructor(
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {}

  async publish(userIds: readonly string[], event: RealtimeEvent): Promise<void> {
    const payload = JSON.stringify(event);
    try {
      await Promise.all(
        [...new Set(userIds)].map((id) => this.redis.publish(channelOf(id), payload)),
      );
    } catch (error) {
      this.logger.warn({ err: error, type: event.type }, 'realtime publish failed');
    }
  }

  async subscribe(userId: string, listener: (event: RealtimeEvent) => void): Promise<() => void> {
    const subscriber = this.connection();
    const channel = channelOf(userId);
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
      await subscriber.subscribe(channel);
    }
    set.add(listener);
    return () => {
      const current = this.listeners.get(channel);
      current?.delete(listener);
      if (current?.size === 0) {
        this.listeners.delete(channel);
        void subscriber.unsubscribe(channel).catch(() => undefined);
      }
    };
  }

  async close(): Promise<void> {
    await this.subscriber?.quit().catch(() => undefined);
  }

  private connection(): Redis {
    if (this.subscriber) return this.subscriber;
    const subscriber = this.redis.duplicate({ lazyConnect: false, maxRetriesPerRequest: null });
    subscriber.on('message', (channel: string, payload: string) => {
      const set = this.listeners.get(channel);
      if (!set) return;
      try {
        const event = JSON.parse(payload) as RealtimeEvent;
        for (const listener of set) listener(event);
      } catch (error) {
        this.logger.warn({ err: error }, 'realtime message was not JSON');
      }
    });
    subscriber.on('error', (error: unknown) => {
      this.logger.warn({ err: error }, 'realtime subscriber error');
    });
    this.subscriber = subscriber;
    return subscriber;
  }
}

/** For tests and single-process runs. */
export class InMemoryRealtime implements Realtime {
  readonly published: { userIds: readonly string[]; event: RealtimeEvent }[] = [];
  private readonly listeners = new Map<string, Set<(event: RealtimeEvent) => void>>();

  publish(userIds: readonly string[], event: RealtimeEvent): Promise<void> {
    this.published.push({ userIds, event });
    for (const id of new Set(userIds)) {
      for (const listener of this.listeners.get(id) ?? []) listener(event);
    }
    return Promise.resolve();
  }

  subscribe(userId: string, listener: (event: RealtimeEvent) => void): Promise<() => void> {
    const set = this.listeners.get(userId) ?? new Set();
    set.add(listener);
    this.listeners.set(userId, set);
    return Promise.resolve(() => {
      set.delete(listener);
    });
  }
}
