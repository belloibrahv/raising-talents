import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventRecorder,
  InMemoryUnitOfWork,
} from '../platform/testing/fakes.js';
import { createAccountsHarness } from '../modules/accounts/testing/accounts-harness.js';
import { applyStaffGrants, parseStaffGrants } from './staff-grants.js';

describe('STAFF_GRANT', () => {
  it('reads email=role pairs and sets aside anything else', () => {
    expect(
      parseStaffGrants(' Mod@Example.com=moderator, boss@example.com = admin ,bad,x=owner'),
    ).toEqual({
      grants: [
        { email: 'mod@example.com', role: 'moderator' },
        { email: 'boss@example.com', role: 'admin' },
      ],
      rejected: ['bad', 'x=owner'],
    });
    expect(parseStaffGrants(undefined)).toEqual({ grants: [], rejected: [] });
  });

  it('grants the role once, and leaves members who chose talent or agent alone', async () => {
    const accounts = createAccountsHarness(new InMemoryEventRecorder(), new FixedClock());
    const staff = await accounts.createAccount({ email: 'mod@example.com', role: null });
    const talent = await accounts.createAccount({ email: 'talent@example.com', role: 'talent' });
    await accounts.facade.completeOnboarding(talent);
    const uow = new InMemoryUnitOfWork();
    const logger = pino({ level: 'silent' });
    const value = 'mod@example.com=moderator,talent@example.com=moderator';
    await applyStaffGrants(value, accounts.facade, uow, logger);
    await applyStaffGrants(value, accounts.facade, uow, logger);
    expect((await accounts.facade.profileContext(staff))?.role).toBe('moderator');
    expect((await accounts.facade.profileContext(talent))?.role).toBe('talent');
  });
});
