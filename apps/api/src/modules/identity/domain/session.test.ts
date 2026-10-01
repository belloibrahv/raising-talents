import { describe, expect, it } from 'vitest';
import { Session } from './session.js';

const now = new Date('2026-10-01T09:00:00.000Z');
const deviceId = '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b';
const start = () =>
  Session.start({
    id: 'session-1',
    userId: 'user-1',
    deviceId,
    refreshTokenHash: 'hash-1',
    now,
    ttlDays: 30,
  });

describe('Session', () => {
  it('begins its own family and expires after the configured days', () => {
    const session = start();
    expect(session.familyId).toBe('session-1');
    expect(session.expiresAt.toISOString()).toBe('2026-10-31T09:00:00.000Z');
    expect(session.checkRefresh(deviceId, now).kind).toBe('usable');
  });

  it('rotates into a successor in the same family and retires itself', () => {
    const session = start();
    const next = session.rotate({
      newId: 'session-2',
      newRefreshTokenHash: 'hash-2',
      now,
      ttlDays: 30,
    });
    expect(next.familyId).toBe('session-1');
    expect(next.checkRefresh(deviceId, now).kind).toBe('usable');
    expect(session.snapshot().revokedReason).toBe('rotated');
  });

  it('reports reuse when a rotated token is presented again', () => {
    const session = start();
    session.rotate({ newId: 'session-2', newRefreshTokenHash: 'hash-2', now, ttlDays: 30 });
    expect(session.checkRefresh(deviceId, now).kind).toBe('reused');
  });

  it('rejects another device, an expired session and a signed-out session', () => {
    expect(start().checkRefresh('0192a3b4-0000-7000-8000-00000000ffff', now).kind).toBe(
      'device_mismatch',
    );
    expect(start().checkRefresh(deviceId, new Date('2026-10-31T09:00:00.000Z')).kind).toBe(
      'expired',
    );
    const signedOut = start();
    signedOut.revoke('signed_out', now);
    expect(signedOut.checkRefresh(deviceId, now).kind).toBe('revoked');
  });
});
