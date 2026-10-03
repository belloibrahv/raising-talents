import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IndexQuery } from '../application/ports.js';
import type { TalentDocument } from '../domain/talent-document.js';
import { dayNumber } from '../domain/talent-document.js';
import { filterFor, TypesenseSearchIndex } from './typesense-search-index.js';

const URL = process.env['TYPESENSE_URL'];
const KEY = process.env['TYPESENSE_API_KEY'] ?? 'local-dev-typesense-key';

const doc = (id: string, overrides: Partial<TalentDocument> = {}): TalentDocument => ({
  id,
  handle: id,
  display_name: 'Ngozi Adeyemi',
  bio: 'Afro-soul singer from Lekki.',
  category: 'music',
  category_name: 'Music',
  subcategories: ['singer'],
  subcategory_names: ['Singer'],
  skills: ['vocals'],
  skill_names: ['Vocals'],
  city: 'ng-lagos',
  city_name: 'Lagos',
  country: 'NG',
  born_on: dayNumber('1999-11-23'),
  verified: false,
  updated_at: 1_790_000_000,
  ...overrides,
});

const query = (overrides: Partial<IndexQuery> = {}): IndexQuery => ({
  text: '',
  subcategories: [],
  cities: [],
  skills: [],
  page: 1,
  perPage: 24,
  ...overrides,
});

describe('filterFor', () => {
  it('builds Typesense filters with every value quoted as a literal', () => {
    expect(
      filterFor(
        query({
          category: 'music',
          cities: ['ng-lagos', 'ng-abuja'],
          bornOnFrom: 10,
          bornOnTo: 20,
        }),
      ),
    ).toBe('category:=`music` && city:=[`ng-lagos`,`ng-abuja`] && born_on:>=10 && born_on:<=20');
    expect(filterFor(query({ category: 'music` || verified:=true' }))).toBe(
      'category:=`music || verified:=true`',
    );
  });
});

/** Runs against a real Typesense when TYPESENSE_URL is set: pnpm dev:infra locally, a service in CI. */
describe.skipIf(!URL)('TypesenseSearchIndex against Typesense', () => {
  let clock = Date.now();
  // The alias name is fixed, so the tests rebuild first to start from a known index.
  const index = new TypesenseSearchIndex(URL ?? '', KEY, fetch, () => new Date((clock += 1000)));

  beforeAll(async () => {
    async function* batches() {
      yield [
        doc('ngozi'),
        doc('emeka', {
          display_name: 'Emeka Obi',
          category: 'sports',
          category_name: 'Sports',
          subcategories: ['football'],
          subcategory_names: ['Football'],
          skills: [],
          skill_names: [],
          city: 'ng-abuja',
          city_name: 'Abuja',
          born_on: dayNumber('2006-03-01'),
          updated_at: 1_790_000_500,
        }),
      ];
    }
    await index.rebuild(batches());
  });

  afterAll(async () => {
    async function* empty() {
      yield [];
    }
    await index.rebuild(empty());
  });

  it('finds by name despite a typo, and ranks the match first', async () => {
    const result = await index.search(query({ text: 'Ngzi Adeyem' }));
    expect(result.hits[0]?.id).toBe('ngozi');
  });

  it('applies category, city and birth-day filters, and counts facets', async () => {
    const lagos = await index.search(query({ cities: ['ng-lagos'] }));
    expect(lagos.hits.map((hit) => hit.id)).toEqual(['ngozi']);

    const young = await index.search(query({ bornOnFrom: dayNumber('2005-01-01') }));
    expect(young.hits.map((hit) => hit.id)).toEqual(['emeka']);

    const all = await index.search(query());
    expect(all.found).toBe(2);
    expect(all.hits.map((hit) => hit.id)).toEqual(['emeka', 'ngozi']);
    expect(all.facets.city).toEqual(
      expect.arrayContaining([
        { value: 'ng-lagos', count: 1 },
        { value: 'ng-abuja', count: 1 },
      ]),
    );
    expect(all.hits[0]).not.toHaveProperty('bio');
  });

  it('upserts and removes, and removing someone absent is fine', async () => {
    await index.upsert(doc('funmi', { display_name: 'Funmilayo Adebayo' }));
    expect((await index.search(query({ text: 'Funmilayo' }))).hits.map((hit) => hit.id)).toEqual([
      'funmi',
    ]);
    await index.remove('funmi');
    await index.remove('funmi');
    expect((await index.search(query({ text: 'Funmilayo' }))).found).toBe(0);
  });

  it('swaps in a rebuilt index and drops the old collection', async () => {
    const before = (await (
      await fetch(`${URL ?? ''}/aliases/talents`, { headers: { 'x-typesense-api-key': KEY } })
    ).json()) as { collection_name: string };
    async function* one() {
      yield [doc('solo')];
    }
    expect(await index.rebuild(one())).toBe(1);
    const after = (await (
      await fetch(`${URL ?? ''}/aliases/talents`, { headers: { 'x-typesense-api-key': KEY } })
    ).json()) as { collection_name: string };
    expect(after.collection_name).not.toBe(before.collection_name);
    const old = await fetch(`${URL ?? ''}/collections/${before.collection_name}`, {
      headers: { 'x-typesense-api-key': KEY },
    });
    expect(old.status).toBe(404);
    expect((await index.search(query())).hits.map((hit) => hit.id)).toEqual(['solo']);
  });
});
