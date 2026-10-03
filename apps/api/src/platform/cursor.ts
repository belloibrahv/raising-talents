const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An opaque page cursor: the last row's time and id, so ties on time still page cleanly. */
export function encodeCursor(at: Date, id: string): string {
  return Buffer.from(`${at.toISOString()}|${id}`).toString('base64url');
}

/**
 * Null for a missing or tampered cursor, which means the first page. Both parts are checked
 * here, because a bad id would otherwise reach a uuid column and fail in the database.
 */
export function decodeCursor(cursor: string | undefined): { at: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id, extra] = Buffer.from(cursor, 'base64url').toString().split('|');
  const at = new Date(iso ?? '');
  return id && extra === undefined && UUID.test(id) && !Number.isNaN(at.getTime())
    ? { at, id }
    : null;
}
