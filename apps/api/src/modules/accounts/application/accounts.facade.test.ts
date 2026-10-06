import { describe, expect, it } from 'vitest';
import { FixedClock, InMemoryEventRecorder } from '../../../platform/testing/fakes.js';
import { AccountEvents } from '../domain/account.events.js';
import { createAccountsHarness } from '../testing/accounts-harness.js';

describe('AccountsFacade.verifyAllPending (ADR-045)', () => {
  it('verifies everyone still waiting for a code, through the domain, and nobody twice', async () => {
    const events = new InMemoryEventRecorder();
    const accounts = createAccountsHarness(events, new FixedClock());
    const waiting = await accounts.createAccount({ email: 'one@example.com', verified: false });
    const alsoWaiting = await accounts.createAccount({ email: 'two@example.com', verified: false });
    await accounts.createAccount({ email: 'done@example.com' });
    events.events.length = 0;

    expect(await accounts.facade.verifyAllPending(1)).toBe(2);
    for (const id of [waiting, alsoWaiting]) {
      expect((await accounts.facade.findSummaryById(id))?.emailVerified).toBe(true);
    }
    // Search and notifications hear about each one, as with a code.
    expect(events.ofType(AccountEvents.EmailVerified)).toHaveLength(2);
    expect(await accounts.facade.verifyAllPending()).toBe(0);
  });
});
