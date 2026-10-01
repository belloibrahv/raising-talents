/**
 * Runs work in one database transaction. Repositories join the current
 * transaction automatically. If the work returns a failed Result, the
 * transaction is rolled back and the Result is still returned.
 */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}
