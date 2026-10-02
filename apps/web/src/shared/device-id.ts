const KEY = 'rt.deviceId';

/**
 * A random id for this browser, so the API can tell sessions apart. It is not a
 * secret and identifies nothing about the person; clearing site data makes a new one.
 */
export function deviceId(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): string {
  const existing = storage.getItem(KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  storage.setItem(KEY, created);
  return created;
}
