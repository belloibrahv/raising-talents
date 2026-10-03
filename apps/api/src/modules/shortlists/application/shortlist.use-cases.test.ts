import { SHORTLIST_MAX, type TalentCard } from '@rt/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock, InMemoryEventRecorder } from '../../../platform/testing/fakes.js';
import { createAccountsHarness } from '../../accounts/testing/accounts-harness.js';
import { InMemoryShortlistRepository } from '../testing/in-memory-shortlist.repository.js';
import {
  GetShortlistEntryQuery,
  ListShortlistQuery,
  RemoveFromShortlistHandler,
  SaveToShortlistHandler,
  ShortlistExport,
  type ShortlistTalents,
} from './shortlist.use-cases.js';

const card = (handle: string): TalentCard => ({
  handle,
  displayName: handle,
  category: { slug: 'music', name: 'Music' },
  subcategories: [],
  city: { slug: 'ng-lagos', name: 'Lagos', countryCode: 'NG' },
  ageYears: 24,
  verified: false,
  avatarUrls: null,
});

describe('Shortlists', () => {
  let clock: FixedClock;
  let accounts: ReturnType<typeof createAccountsHarness>;
  let entries: InMemoryShortlistRepository;
  let list: ListShortlistQuery;
  let get: GetShortlistEntryQuery;
  let save: SaveToShortlistHandler;
  let remove: RemoveFromShortlistHandler;
  let exporter: ShortlistExport;
  let agentId: string;
  /** handle -> user id, and which of them are visible right now. */
  const talents = new Map<string, string>();
  const hidden = new Set<string>();

  beforeEach(async () => {
    clock = new FixedClock();
    accounts = createAccountsHarness(new InMemoryEventRecorder(), clock);
    entries = new InMemoryShortlistRepository();
    talents.clear();
    hidden.clear();
    const directory: ShortlistTalents = {
      visibleUserId: (handle) => {
        const id = talents.get(handle) ?? null;
        return Promise.resolve(id && !hidden.has(id) ? id : null);
      },
      userIdOf: (handle) => Promise.resolve(talents.get(handle) ?? null),
      cardFor: (userId) => {
        const handle = [...talents].find(([, id]) => id === userId)?.[0];
        return Promise.resolve(handle && !hidden.has(userId) ? card(handle) : null);
      },
      handleOf: (userId) =>
        Promise.resolve([...talents].find(([, id]) => id === userId)?.[0] ?? null),
    };
    list = new ListShortlistQuery(entries, accounts.facade, directory);
    get = new GetShortlistEntryQuery(entries, accounts.facade, directory);
    save = new SaveToShortlistHandler(entries, accounts.facade, directory, clock);
    remove = new RemoveFromShortlistHandler(entries, accounts.facade, directory);
    exporter = new ShortlistExport(entries, directory);

    agentId = await accounts.createAccount({ email: 'scout@example.com', role: 'agent' });
    await accounts.facade.completeOnboarding(agentId);
    for (const handle of ['ada.sings', 'bola.runs', 'chidi.acts']) {
      talents.set(handle, await accounts.createAccount({ email: `${handle}@example.com` }));
    }
  });

  it('saves, keeps the first saved date when the note changes, and lists newest first', async () => {
    await save.execute(agentId, 'ada.sings', { note: 'Strong live vocals' });
    clock.advanceSeconds(60);
    await save.execute(agentId, 'bola.runs', {});
    clock.advanceSeconds(60);
    const edited = await save.execute(agentId, 'ada.sings', { note: 'Call after the showcase' });
    expect(edited.ok && edited.value).toMatchObject({
      note: 'Call after the showcase',
      savedAt: '2026-10-01T09:00:00.000Z',
    });
    const page = await list.execute(agentId);
    expect(page.ok && page.value.items.map((item) => item.talent.handle)).toEqual([
      'bola.runs',
      'ada.sings',
    ]);
    expect(page.ok && page.value).toMatchObject({ saved: 2, max: SHORTLIST_MAX, nextCursor: null });
  });

  it('keeps a note when saving again without one, and removes even hidden talent', async () => {
    await save.execute(agentId, 'chidi.acts', { note: 'Theatre background' });
    const again = await save.execute(agentId, 'chidi.acts', {});
    expect(again.ok && again.value.note).toBe('Theatre background');

    hidden.add(talents.get('chidi.acts') ?? '');
    const page = await list.execute(agentId);
    expect(page.ok && page.value).toMatchObject({ items: [], saved: 1 });
    const one = await get.execute(agentId, 'chidi.acts');
    expect(one.ok ? null : one.error.code).toBe('NOT_FOUND');

    expect((await remove.execute(agentId, 'chidi.acts')).ok).toBe(true);
    expect(await entries.count(agentId)).toBe(0);
  });

  it('is for active agents only, and refuses talent who cannot be seen', async () => {
    const talentId = talents.get('ada.sings') ?? '';
    const asTalent = await save.execute(talentId, 'bola.runs', {});
    expect(asTalent.ok ? null : asTalent.error.code).toBe('WRONG_ROLE');
    const onboarding = await accounts.createAccount({ email: 'new@example.com', role: 'agent' });
    const early = await save.execute(onboarding, 'bola.runs', {});
    expect(early.ok ? null : early.error.code).toBe('FORBIDDEN');
    const unknown = await save.execute(agentId, 'nobody.here', {});
    expect(unknown.ok ? null : unknown.error.code).toBe('NOT_FOUND');
  });

  it('stops new saves at the limit but still lets the agent edit a note', async () => {
    await save.execute(agentId, 'ada.sings', {});
    for (let n = entries.rows.size; n < SHORTLIST_MAX; n += 1) {
      await entries.save({
        agentId,
        talentId: `0192a3b4-0000-7000-8000-${String(n).padStart(12, '0')}`,
        note: '',
        savedAt: clock.now(),
        updatedAt: clock.now(),
      });
    }
    const full = await save.execute(agentId, 'bola.runs', {});
    expect(full.ok ? null : full.error.code).toBe('SHORTLIST_FULL');
    expect((await save.execute(agentId, 'ada.sings', { note: 'Still editable' })).ok).toBe(true);
  });

  it('pages through a long list without repeats', async () => {
    for (let n = 0; n < 30; n += 1) {
      const handle = `talent.${String(n)}`;
      talents.set(handle, await accounts.createAccount({ email: `${handle}@example.com` }));
      await save.execute(agentId, handle, {});
      clock.advanceSeconds(1);
    }
    const first = await list.execute(agentId);
    if (!first.ok) throw new Error(first.error.message);
    const second = await list.execute(agentId, first.value.nextCursor ?? undefined);
    if (!second.ok) throw new Error(second.error.message);
    const handles = [...first.value.items, ...second.value.items].map((item) => item.talent.handle);
    expect(new Set(handles).size).toBe(30);
    expect(handles[0]).toBe('talent.29');
    expect(second.value.nextCursor).toBeNull();
  });

  it('exports the agent own saves with handles and notes', async () => {
    await save.execute(agentId, 'ada.sings', { note: 'Strong live vocals' });
    expect(await exporter.forAgent(agentId)).toEqual([
      { handle: 'ada.sings', note: 'Strong live vocals', savedAt: '2026-10-01T09:00:00.000Z' },
    ]);
  });
});
