import type { MeResponse } from '@rt/contracts';

export type SessionStatus = 'restoring' | 'unreachable' | 'signedOut' | 'signedIn';

export type AppArea = 'auth' | 'chooseRole' | 'app';

/**
 * Which part of the app a person may see: choose a role, then the app opens. The email can
 * be verified at any point; until it is, others cannot see the account (ADR-037).
 */
export function areaFor(status: SessionStatus, me: MeResponse | null): AppArea | null {
  if (status === 'restoring' || status === 'unreachable') return null;
  if (status === 'signedOut' || !me) return 'auth';
  if (me.role === null) return 'chooseRole';
  return 'app';
}
