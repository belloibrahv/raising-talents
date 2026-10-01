import { AsyncLocalStorage } from 'node:async_hooks';
import type { UnitOfWork } from '../unit-of-work.js';
import { isErr } from '../result.js';
import type { Database, Executor, Transaction } from './client.js';

class RollbackSignal extends Error {}

/**
 * Carries the open transaction through async calls, so repositories join it
 * without anyone passing it around. Nested runs reuse the outer transaction.
 */
export class DrizzleUnitOfWork implements UnitOfWork {
  private readonly storage = new AsyncLocalStorage<Transaction>();

  constructor(private readonly db: Database) {}

  executor(): Executor {
    return this.storage.getStore() ?? this.db;
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.storage.getStore()) return work();

    let outcome: T | undefined;
    try {
      await this.db.transaction(async (tx) => {
        outcome = await this.storage.run(tx, work);
        if (isErr(outcome)) throw new RollbackSignal();
      });
    } catch (error) {
      if (!(error instanceof RollbackSignal)) throw error;
    }
    return outcome as T;
  }
}
