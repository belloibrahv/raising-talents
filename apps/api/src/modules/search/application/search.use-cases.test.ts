import type { AccountStatus, PublicTalentProfile, Role } from '@rt/contracts';
import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { FixedClock, InMemoryRateLimiter } from '../../../platform/testing/fakes.js';
import { sampleTaxonomySource } from '../../taxonomy/testing/sample-taxonomy.js';
import { InMemorySearchIndex } from '../testing/in-memory-search-index.js';
import { DisabledSearchIndex } from '../infrastructure/typesense-search-index.js';
import type { SearchAccounts, SearchTalents } from './ports.js';
import {
  IndexTalentHandler,
  RebuildSearchIndex,
  SearchTalentsHandler,
} from './search.use-cases.js';

const AGENT = 'agent-1';

const profile = (overrides: Partial<PublicTalentProfile> = {}): PublicTalentProfile => ({
  handle: 'ngozi.adeyemi',
  displayName: 'Ngozi Adeyemi',
  bio: 'Afro-soul singer from Lekki.',
  category: { slug: 'music', name: 'Music' },
  subcategories: [{ slug: 'singer', name: 'Singer' }],
  skills: [{ slug: 'vocals', name: 'Vocals' }],
  city: { slug: 'ng-lagos', name: 'Lagos', countryCode: 'NG' },
  ageYears: null,
  gender: null,
  verified: false,
  avatarMediaId: 'avatar-1',
  avatarUrls: null,
  ...overrides,
});

class FakeTalents implements SearchTalents {
  readonly profiles = new Map<string, PublicTalentProfile>();
  async searchable(userId: string) {
    const found = this.profiles.get(userId);
    return found
      ? { userId, profile: found, updatedAt: new Date('2026-10-01T09:00:00.000Z') }
      : null;
  }
  async *completeUserIds(): AsyncGenerator<readonly string[]> {
    yield [...this.profiles.keys()];
  }
}

class FakeAccounts implements SearchAccounts {
  readonly accounts = new Map<string, { role: Role; status: AccountStatus; dateOfBirth: string }>();
  async indexFacts(userId: string) {
    const account = this.accounts.get(userId);
    return account ? { status: account.status, dateOfBirth: account.dateOfBirth } : null;
  }
  async profileContext(userId: string) {
    const account = this.accounts.get(userId);
    return account ? { role: account.role, status: account.status } : null;
  }
}

const event = (userId: string) => ({
  type: 'talent.TalentProfileUpdated',
  aggregateId: userId,
  occurredAt: new Date(),
  payload: {},
});

describe('talent search', () => {
  let index: InMemorySearchIndex;
  let talents: FakeTalents;
  let accounts: FakeAccounts;
  let indexer: IndexTalentHandler;
  let search: SearchTalentsHandler;

  const addTalent = async (
    id: string,
    overrides: Partial<PublicTalentProfile> = {},
    dateOfBirth = '1999-11-23',
    status: AccountStatus = 'active',
  ) => {
    talents.profiles.set(id, profile({ handle: id, ...overrides }));
    accounts.accounts.set(id, { role: 'talent', status, dateOfBirth });
    await indexer.handle(event(id));
  };

  const query = (overrides: Record<string, unknown> = {}) => ({
    subcategories: [],
    cities: [],
    skills: [],
    page: 1,
    ...overrides,
  });

  beforeEach(() => {
    index = new InMemorySearchIndex();
    talents = new FakeTalents();
    accounts = new FakeAccounts();
    accounts.accounts.set(AGENT, { role: 'agent', status: 'active', dateOfBirth: '1985-01-01' });
    indexer = new IndexTalentHandler(index, talents, accounts);
    search = new SearchTalentsHandler(
      index,
      accounts,
      sampleTaxonomySource,
      (ownerId, mediaId) => ({
        small: `https://media.test/${ownerId}/${mediaId}/256.webp`,
        medium: `https://media.test/${ownerId}/${mediaId}/1024.webp`,
        large: `https://media.test/${ownerId}/${mediaId}/2048.webp`,
      }),
      new InMemoryRateLimiter(),
      new FixedClock(new Date('2026-10-02T09:00:00.000Z')),
    );
  });

  it('indexes complete, active talent and removes them when that stops being true', async () => {
    await addTalent('ngozi');
    expect(index.documents.has('ngozi')).toBe(true);

    accounts.accounts.set('ngozi', {
      role: 'talent',
      status: 'suspended',
      dateOfBirth: '1999-11-23',
    });
    await indexer.handle(event('ngozi'));
    expect(index.documents.has('ngozi')).toBe(false);

    await addTalent('tobi', {}, '1998-01-01', 'onboarding');
    expect(index.documents.has('tobi')).toBe(false);
    talents.profiles.delete('tobi');
    await indexer.handle(event('tobi'));
    expect(index.documents.has('tobi')).toBe(false);
  });

  it('keeps the date of birth out of every result, showing age in years', async () => {
    await addTalent('ngozi', {}, '1999-11-23');
    const result = await search.execute(AGENT, query());
    expect(result.ok && result.value.items[0]).toEqual({
      handle: 'ngozi',
      displayName: 'Ngozi Adeyemi',
      category: { slug: 'music', name: 'Music' },
      subcategories: [{ slug: 'singer', name: 'Singer' }],
      city: { slug: 'ng-lagos', name: 'Lagos', countryCode: 'NG' },
      ageYears: 26,
      verified: false,
      avatarUrls: {
        small: 'https://media.test/ngozi/avatar-1/256.webp',
        medium: 'https://media.test/ngozi/avatar-1/1024.webp',
        large: 'https://media.test/ngozi/avatar-1/2048.webp',
      },
    });
    expect(JSON.stringify(result)).not.toContain('1999');
  });

  it('filters by text, category, city and age, and counts per city', async () => {
    await addTalent('ngozi', {}, '1999-11-23');
    await addTalent(
      'emeka',
      {
        displayName: 'Emeka Obi',
        category: { slug: 'sports', name: 'Sports' },
        subcategories: [{ slug: 'football', name: 'Football' }],
        skills: [],
        city: { slug: 'ng-abuja', name: 'Abuja', countryCode: 'NG' },
      },
      '2006-03-01',
    );

    const byText = await search.execute(AGENT, query({ q: 'emeka' }));
    expect(byText.ok && byText.value.items.map((item) => item.handle)).toEqual(['emeka']);

    const byCity = await search.execute(AGENT, query({ cities: ['ng-lagos'] }));
    expect(byCity.ok && byCity.value.items.map((item) => item.handle)).toEqual(['ngozi']);

    const young = await search.execute(AGENT, query({ ageMin: 18, ageMax: 21 }));
    expect(young.ok && young.value.items.map((item) => item.handle)).toEqual(['emeka']);

    const all = await search.execute(AGENT, query());
    expect(all.ok && all.value.facets.cities).toEqual(
      expect.arrayContaining([
        { slug: 'ng-lagos', name: 'Lagos', count: 1 },
        { slug: 'ng-abuja', name: 'Abuja', count: 1 },
      ]),
    );
  });

  it('pages through results and says when there are more', async () => {
    for (let n = 0; n < 30; n += 1) await addTalent(`talent-${String(n).padStart(2, '0')}`);
    const first = await search.execute(AGENT, query());
    const second = await search.execute(AGENT, query({ page: 2 }));
    expect(first.ok && [first.value.items.length, first.value.total, first.value.hasMore]).toEqual([
      24,
      30,
      true,
    ]);
    expect(second.ok && [second.value.items.length, second.value.hasMore]).toEqual([6, false]);
  });

  it('lets only active agents search', async () => {
    accounts.accounts.set('talent-viewer', {
      role: 'talent',
      status: 'active',
      dateOfBirth: '1999-01-01',
    });
    accounts.accounts.set('new-agent', {
      role: 'agent',
      status: 'onboarding',
      dateOfBirth: '1990-01-01',
    });
    const asTalent = await search.execute('talent-viewer', query());
    const unfinished = await search.execute('new-agent', query());
    expect(asTalent.ok ? null : asTalent.error.code).toBe('WRONG_ROLE');
    expect(unfinished.ok ? null : unfinished.error.code).toBe('FORBIDDEN');
  });

  it('answers 503 when search is switched off, and indexing does nothing', async () => {
    const disabled = new DisabledSearchIndex();
    const off = new SearchTalentsHandler(
      disabled,
      accounts,
      sampleTaxonomySource,
      () => ({ small: '', medium: '', large: '' }),
      new InMemoryRateLimiter(),
      new FixedClock(),
    );
    const result = await off.execute(AGENT, query());
    expect(result.ok ? null : result.error.code).toBe('SEARCH_UNAVAILABLE');
    await expect(
      new IndexTalentHandler(disabled, talents, accounts).handle(event('x')),
    ).resolves.toBeUndefined();
  });

  it('rebuilds from the source of truth, dropping anyone who should not be found', async () => {
    await addTalent('ngozi');
    talents.profiles.set('suspended', profile({ handle: 'suspended' }));
    accounts.accounts.set('suspended', {
      role: 'talent',
      status: 'suspended',
      dateOfBirth: '1999-01-01',
    });
    const ngozi = index.documents.get('ngozi');
    if (!ngozi) throw new Error('ngozi should be indexed');
    index.documents.set('stale', { ...ngozi, id: 'stale' });
    const count = await new RebuildSearchIndex(
      index,
      talents,
      accounts,
      pino({ level: 'silent' }),
    ).run();
    expect(count).toBe(1);
    expect([...index.documents.keys()]).toEqual(['ngozi']);
  });
});
