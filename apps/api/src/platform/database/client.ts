import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Executor = Database | Transaction;

export interface DatabaseHandle {
  readonly db: Database;
  close(): Promise<void>;
}

export function createDatabase(url: string, poolMax: number): DatabaseHandle {
  const pool = new pg.Pool({ connectionString: url, max: poolMax });
  const db = drizzle(pool, { schema });
  return { db, close: () => pool.end() };
}
