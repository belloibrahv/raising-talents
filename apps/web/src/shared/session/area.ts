import type { MeResponse } from '@rt/contracts';

export type SessionStatus = 'restoring' | 'unreachable' | 'signedOut' | 'signedIn';

export type AppArea = 'auth' | 'verifyEmail' | 'chooseRole' | 'app';

/**
 * Which part of the app a person may see. Onboarding is a strict sequence:
 * verify the email, then choose a role, then the app opens.
 */
export function areaFor(status: SessionStatus, me: MeResponse | null): AppArea | null {
  if (status === 'restoring' || status === 'unreachable') return null;
  if (status === 'signedOut' || !me) return 'auth';
  if (!me.emailVerified) return 'verifyEmail';
  if (me.role === null) return 'chooseRole';
  return 'app';
}
