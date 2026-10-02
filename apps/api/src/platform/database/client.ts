import { readFileSync } from 'node:fs';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { AppConfig } from '../../config/env.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type Executor = Database | Transaction;

export interface DatabaseHandle {
  readonly db: Database;
  /** For the few things Drizzle does not cover, such as session advisory locks. */
  readonly pool: pg.Pool;
  close(): Promise<void>;
}

export type DatabaseSettings = Pick<
  AppConfig,
  | 'DATABASE_URL'
  | 'DATABASE_HOST'
  | 'DATABASE_PORT'
  | 'DATABASE_NAME'
  | 'DATABASE_USER'
  | 'DATABASE_PASSWORD'
  | 'DATABASE_SSL'
  | 'DATABASE_CA_FILE'
  | 'DATABASE_POOL_MAX'
>;

/** Builds pg connection options. Exported so the rules are unit tested. */
export function poolConfig(
  settings: DatabaseSettings,
  readFile: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): pg.PoolConfig {
  const connection: pg.PoolConfig = settings.DATABASE_URL
    ? { connectionString: settings.DATABASE_URL }
    : {
        host: settings.DATABASE_HOST,
        port: settings.DATABASE_PORT,
        database: settings.DATABASE_NAME,
        user: settings.DATABASE_USER,
        password: settings.DATABASE_PASSWORD,
      };
  return {
    ...connection,
    max: settings.DATABASE_POOL_MAX,
    // Fail fast instead of hanging when the database is unreachable or a query stalls.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 15_000,
    keepAlive: true,
    ...(settings.DATABASE_SSL === 'verify-full' && settings.DATABASE_CA_FILE
      ? { ssl: { rejectUnauthorized: true, ca: readFile(settings.DATABASE_CA_FILE) } }
      : {}),
  };
}

export function createDatabase(settings: DatabaseSettings): DatabaseHandle {
  const pool = new pg.Pool(poolConfig(settings));
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}
