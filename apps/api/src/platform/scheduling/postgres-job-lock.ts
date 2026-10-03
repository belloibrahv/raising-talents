import type { Pool } from 'pg';
import type { JobLock } from './job-scheduler.js';

/**
 * A session advisory lock on one pooled connection, held for the whole run and
 * released before the connection goes back. A crashed worker loses the lock with its connection.
 */
export class PostgresJobLock implements JobLock {
  constructor(private readonly pool: Pool) {}

  async runExclusively(name: string, work: () => Promise<void>): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      const { rows } = await client.query<{ locked: boolean }>(
        'select pg_try_advisory_lock(hashtext($1)) as locked',
        [name],
      );
      if (!rows[0]?.locked) return false;
      try {
        await work();
      } finally {
        await client.query('select pg_advisory_unlock(hashtext($1))', [name]);
      }
      return true;
    } finally {
      client.release();
    }
  }
}
