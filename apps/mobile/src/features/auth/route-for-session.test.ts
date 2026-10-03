import type { MeResponse } from '@rt/contracts';
import { describe, expect, it } from 'vitest';
import { areaFor } from './route-for-session';

const me = (overrides: Partial<MeResponse>): MeResponse => ({
  id: '0192a3b4-0000-7000-8000-000000000001',
  email: 'chidi.eze@example.com',
  emailVerified: true,
  role: 'agent',
  roleLocked: false,
  status: 'onboarding',
  countryCode: 'NG',
  createdAt: '2026-10-01T09:00:00.000Z',
  ...overrides,
});

describe('areaFor', () => {
  it('shows nothing while the session is being restored or the API is unreachable', () => {
    expect(areaFor('restoring', null)).toBeNull();
    expect(areaFor('unreachable', null)).toBeNull();
  });

  it('walks onboarding in order: email, role, then the app', () => {
    expect(areaFor('signedOut', null)).toBe('auth');
    expect(areaFor('signedIn', me({ emailVerified: false, role: null }))).toBe('verifyEmail');
    expect(areaFor('signedIn', me({ emailVerified: false, role: 'talent' }))).toBe('verifyEmail');
    expect(areaFor('signedIn', me({ role: null }))).toBe('chooseRole');
    expect(areaFor('signedIn', me({}))).toBe('app');
  });
});
