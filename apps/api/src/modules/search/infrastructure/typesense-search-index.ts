import type { TalentDocument } from '../domain/talent-document.js';
import type { FacetCount, IndexQuery, IndexResult, SearchIndex } from '../application/ports.js';

const TIMEOUT_MS = 5000;
const ALIAS = 'talents';

/** Field order and weights: a name match matters most, the bio least. */
const QUERY_BY = [
  'display_name',
  'handle',
  'skill_names',
  'subcategory_names',
  'category_name',
  'city_name',
  'bio',
];
const QUERY_WEIGHTS = [8, 8, 4, 4, 3, 3, 1];

const SCHEMA_FIELDS = [
  { name: 'handle', type: 'string' },
  { name: 'display_name', type: 'string' },
  { name: 'bio', type: 'string' },
  { name: 'category', type: 'string', facet: true },
  { name: 'category_name', type: 'string' },
  { name: 'subcategories', type: 'string[]', facet: true },
  { name: 'subcategory_names', type: 'string[]' },
  { name: 'skills', type: 'string[]', facet: true },
  { name: 'skill_names', type: 'string[]' },
  { name: 'city', type: 'string', facet: true },
  { name: 'city_name', type: 'string' },
  { name: 'country', type: 'string', facet: true },
  { name: 'gender', type: 'string', facet: true, optional: true },
  { name: 'born_on', type: 'int32', optional: true },
  { name: 'verified', type: 'bool', facet: true },
  { name: 'avatar_media_id', type: 'string', optional: true, index: false },
  { name: 'updated_at', type: 'int64', sort: true },
];

export class TypesenseError extends Error {
  constructor(
    readonly status: number,
    path: string,
    detail: string,
  ) {
    super(`Typesense ${path} answered ${String(status)}: ${detail}`);
  }
}

/** Slugs are safe already; backticks keep any value literal in a filter. */
const literal = (value: string) => `\`${value.replaceAll('`', '')}\``;

export function filterFor(query: IndexQuery): string {
  const parts: string[] = [];
  if (query.category) parts.push(`category:=${literal(query.category)}`);
  if (query.subcategories.length)
    parts.push(`subcategories:=[${query.subcategories.map(literal).join(',')}]`);
  if (query.cities.length) parts.push(`city:=[${query.cities.map(literal).join(',')}]`);
  if (query.skills.length) parts.push(`skills:=[${query.skills.map(literal).join(',')}]`);
  if (query.gender) parts.push(`gender:=${literal(query.gender)}`);
  if (query.bornOnFrom !== undefined) parts.push(`born_on:>=${String(query.bornOnFrom)}`);
  if (query.bornOnTo !== undefined) parts.push(`born_on:<=${String(query.bornOnTo)}`);
  return parts.join(' && ');
}

/**
 * Typesense over its REST API. Searches and writes go through the "talents" alias, so a
 * rebuild fills a new collection and swaps the alias with no moment where search is empty.
 */
export class TypesenseSearchIndex implements SearchIndex {
  readonly enabled = true;
  private ready: Promise<void> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async upsert(document: TalentDocument): Promise<void> {
    await this.ensureAlias();
    await this.call(
      'POST',
      `/collections/${ALIAS}/documents?action=upsert`,
      JSON.stringify(document),
    );
  }

  async remove(id: string): Promise<void> {
    await this.ensureAlias();
    await this.call(
      'DELETE',
      `/collections/${ALIAS}/documents/${encodeURIComponent(id)}`,
      undefined,
      [404],
    );
  }

  async search(query: IndexQuery): Promise<IndexResult> {
    await this.ensureAlias();
    const params = new URLSearchParams({
      q: query.text.trim() || '*',
      query_by: QUERY_BY.join(','),
      query_by_weights: QUERY_WEIGHTS.join(','),
      facet_by: 'category,city',
      max_facet_values: '50',
      sort_by: query.text.trim() ? '_text_match:desc,updated_at:desc' : 'updated_at:desc',
      num_typos: '2',
      exclude_fields: 'bio',
      page: String(query.page),
      per_page: String(query.perPage),
    });
    const filter = filterFor(query);
    if (filter) params.set('filter_by', filter);
    const body = (await this.call(
      'GET',
      `/collections/${ALIAS}/documents/search?${params.toString()}`,
    )) as {
      found: number;
      hits: { document: TalentDocument }[];
      facet_counts?: { field_name: string; counts: FacetCount[] }[];
    };
    const facet = (name: string) =>
      (body.facet_counts?.find((entry) => entry.field_name === name)?.counts ?? []).map(
        ({ value, count }) => ({
          value,
          count,
        }),
      );
    return {
      hits: body.hits.map((hit) => hit.document),
      found: body.found,
      facets: { category: facet('category'), city: facet('city') },
    };
  }

  async rebuild(batches: AsyncIterable<readonly TalentDocument[]>): Promise<number> {
    const previous = await this.aliasTarget();
    const next = await this.createCollection();
    let count = 0;
    for await (const batch of batches) {
      if (batch.length === 0) continue;
      const lines = (await this.call(
        'POST',
        `/collections/${next}/documents/import?action=create`,
        batch.map((document) => JSON.stringify(document)).join('\n'),
        [],
        'text',
      )) as string;
      const failed = lines.split('\n').filter((line) => line && !line.includes('"success":true'));
      if (failed.length > 0)
        throw new Error(`Typesense refused ${String(failed.length)} documents: ${failed[0] ?? ''}`);
      count += batch.length;
    }
    await this.call('PUT', `/aliases/${ALIAS}`, JSON.stringify({ collection_name: next }));
    this.ready = Promise.resolve();
    if (previous && previous !== next)
      await this.call('DELETE', `/collections/${previous}`, undefined, [404]);
    return count;
  }

  /** The first call creates an empty collection and the alias, if this is a new Typesense. */
  private ensureAlias(): Promise<void> {
    this.ready ??= (async () => {
      if (await this.aliasTarget()) return;
      const created = await this.createCollection();
      await this.call('PUT', `/aliases/${ALIAS}`, JSON.stringify({ collection_name: created }));
    })().catch((error: unknown) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }

  private async aliasTarget(): Promise<string | null> {
    const alias = (await this.call('GET', `/aliases/${ALIAS}`, undefined, [404])) as
      { collection_name?: string } | undefined;
    return alias?.collection_name ?? null;
  }

  private async createCollection(): Promise<string> {
    const name = `${ALIAS}_${String(this.now().getTime())}`;
    await this.call(
      'POST',
      '/collections',
      JSON.stringify({ name, fields: SCHEMA_FIELDS, default_sorting_field: 'updated_at' }),
    );
    return name;
  }

  private async call(
    method: string,
    path: string,
    body?: string,
    tolerated: readonly number[] = [],
    as: 'json' | 'text' = 'json',
  ): Promise<unknown> {
    const response = await this.fetchFn(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        'x-typesense-api-key': this.apiKey,
        ...(body === undefined
          ? {}
          : { 'content-type': path.includes('/import') ? 'text/plain' : 'application/json' }),
      },
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (tolerated.includes(response.status)) return undefined;
    if (!response.ok) throw new TypesenseError(response.status, path, await response.text());
    return as === 'text' ? response.text() : response.json();
  }
}

/** Search switched off: indexing does nothing and the search endpoint answers 503. */
export class DisabledSearchIndex implements SearchIndex {
  readonly enabled = false;
  upsert(): Promise<void> {
    return Promise.resolve();
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
  search(): Promise<IndexResult> {
    return Promise.reject(new Error('Search is disabled'));
  }
  rebuild(): Promise<number> {
    return Promise.reject(new Error('Search is disabled. Set SEARCH_INDEX=typesense.'));
  }
}
