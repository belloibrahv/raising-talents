import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor.js';

const id = '0192a3b4-0000-7000-8000-0000000000aa';
const at = new Date('2026-10-03T09:00:00.000Z');
const raw = (text: string) => Buffer.from(text).toString('base64url');

describe('page cursors', () => {
  it('round-trips the time and id', () => {
    expect(decodeCursor(encodeCursor(at, id))).toEqual({ at, id });
  });

  it('treats a tampered cursor as the first page instead of passing it to the database', () => {
    for (const cursor of [
      raw(`${at.toISOString()}|x`),
      raw(`${at.toISOString()}|${id}' or 1=1`),
      raw(`not-a-date|${id}`),
      raw(`${at.toISOString()}|${id}|extra`),
      'not base64 at all',
      '',
    ]) {
      expect(decodeCursor(cursor)).toBeNull();
    }
  });
});
