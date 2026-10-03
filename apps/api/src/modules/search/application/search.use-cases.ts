import {
  SEARCH_PAGE_SIZE,
  type SearchTalentsQuery,
  type TalentCard,
  type TalentSearchResponse,
} from '@rt/contracts';
import type { Logger } from 'pino';
import type { Clock } from '../../../platform/clock.js';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { TaxonomySource } from '../../taxonomy/application/taxonomy-catalog.js';
import {
  ageFromDay,
  bornOnRange,
  toDocument,
  type TalentDocument,
} from '../domain/talent-document.js';
import type { AvatarUrls, SearchAccounts, SearchIndex, SearchTalents } from './ports.js';

export const SEARCH = {
  Index: Symbol('SearchIndex'),
  Talents: Symbol('SearchTalents'),
  Accounts: Symbol('SearchAccounts'),
  AvatarUrls: Symbol('SearchAvatarUrls'),
  Search: Symbol('SearchTalentsHandler'),
  IndexTalent: Symbol('IndexTalentHandler'),
  Rebuild: Symbol('RebuildSearchIndex'),
  EventHandlers: Symbol('SearchEventHandlers'),
} as const;

/** The events that can change whether or how a talent appears in search. */
export const INDEXING_EVENTS = [
  'talent.TalentProfileUpdated',
  'accounts.OnboardingCompleted',
  'accounts.DeletionRequested',
  'accounts.DeletionCancelled',
  'accounts.AccountDeleted',
  'accounts.AccountSuspended',
  'accounts.AccountBanned',
  'accounts.AccountReinstated',
] as const;

/** Roles that may search. Talent find each other through links, not search, in the MVP. */
const SEARCHING_ROLES = new Set(['agent', 'moderator', 'admin']);

export const SEARCH_LIMIT = { perUser: 120, windowSeconds: 60 } as const;

export const SearchErrors = {
  unavailable: () =>
    domainError(
      'SEARCH_UNAVAILABLE',
      'Search is not available right now. Try again in a few minutes.',
    ),
  wrongRole: () => domainError('WRONG_ROLE', 'Only agents and scouts can search for talent.'),
  notActive: () => domainError('FORBIDDEN', 'Finish setting up your profile before searching.'),
};

/** Builds a talent's document from the current state, or null when they must not be found. */
async function documentFor(
  userId: string,
  talents: SearchTalents,
  accounts: SearchAccounts,
): Promise<TalentDocument | null> {
  const [talent, facts] = await Promise.all([
    talents.searchable(userId),
    accounts.indexFacts(userId),
  ]);
  if (!talent || facts?.status !== 'active') return null;
  return toDocument({ ...talent, dateOfBirth: facts.dateOfBirth });
}

/**
 * Runs in the worker. Reads the talent's current state rather than trusting the event,
 * so events arriving twice or out of order still leave the index right.
 */
export class IndexTalentHandler {
  constructor(
    private readonly index: SearchIndex,
    private readonly talents: SearchTalents,
    private readonly accounts: SearchAccounts,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    if (!this.index.enabled) return;
    const document = await documentFor(event.aggregateId, this.talents, this.accounts);
    if (document) await this.index.upsert(document);
    else await this.index.remove(event.aggregateId);
  }
}

/** Recreates the whole index from Postgres, the source of truth (ADR-006). */
export class RebuildSearchIndex {
  constructor(
    private readonly index: SearchIndex,
    private readonly talents: SearchTalents,
    private readonly accounts: SearchAccounts,
    private readonly logger: Logger,
  ) {}

  async run(): Promise<number> {
    const { talents, accounts } = this;
    async function* batches(): AsyncGenerator<readonly TalentDocument[]> {
      for await (const ids of talents.completeUserIds()) {
        const documents = await Promise.all(ids.map((id) => documentFor(id, talents, accounts)));
        yield documents.filter((document): document is TalentDocument => document !== null);
      }
    }
    const count = await this.index.rebuild(batches());
    this.logger.info({ count }, 'search index rebuilt');
    return count;
  }
}

export class SearchTalentsHandler {
  constructor(
    private readonly index: SearchIndex,
    private readonly accounts: SearchAccounts,
    private readonly taxonomy: TaxonomySource,
    private readonly avatarUrls: AvatarUrls,
    private readonly rateLimiter: RateLimiter,
    private readonly clock: Clock,
  ) {}

  async execute(
    viewerId: string,
    query: SearchTalentsQuery,
  ): Promise<Result<TalentSearchResponse, DomainError>> {
    const viewer = await this.accounts.profileContext(viewerId);
    if (!viewer?.role || !SEARCHING_ROLES.has(viewer.role)) return err(SearchErrors.wrongRole());
    if (viewer.status !== 'active') return err(SearchErrors.notActive());
    if (!this.index.enabled) return err(SearchErrors.unavailable());
    const limit = await this.rateLimiter.consume(
      `search:${viewerId}`,
      SEARCH_LIMIT.perUser,
      SEARCH_LIMIT.windowSeconds,
    );
    if (!limit.allowed) {
      return err(
        domainError('RATE_LIMITED', 'Too many searches. Wait a moment.', limit.retryAfterSeconds),
      );
    }

    const today = this.clock.now();
    const born = bornOnRange({ min: query.ageMin, max: query.ageMax }, today);
    const result = await this.index.search({
      text: query.q ?? '',
      category: query.category,
      subcategories: query.subcategories,
      cities: query.cities,
      skills: query.skills,
      gender: query.gender,
      bornOnFrom: born.from,
      bornOnTo: born.to,
      page: query.page,
      perPage: SEARCH_PAGE_SIZE,
    });

    const catalog = await this.taxonomy.current();
    const facet = (
      values: readonly { value: string; count: number }[],
      name: (slug: string) => string | null,
    ) =>
      values.flatMap((entry) => {
        const label = name(entry.value);
        return label ? [{ slug: entry.value, name: label, count: entry.count }] : [];
      });

    return ok({
      items: result.hits.map((hit) => this.card(hit, today)),
      total: result.found,
      page: query.page,
      perPage: SEARCH_PAGE_SIZE,
      hasMore: query.page * SEARCH_PAGE_SIZE < result.found,
      facets: {
        categories: facet(result.facets.category, (slug) => catalog.category(slug)?.name ?? null),
        cities: facet(result.facets.city, (slug) => catalog.city(slug)?.name ?? null),
      },
    });
  }

  private card(hit: TalentDocument, today: Date): TalentCard {
    return {
      handle: hit.handle,
      displayName: hit.display_name,
      category: { slug: hit.category, name: hit.category_name },
      subcategories: hit.subcategories.map((slug, index) => ({
        slug,
        name: hit.subcategory_names[index] ?? slug,
      })),
      city: { slug: hit.city, name: hit.city_name, countryCode: hit.country },
      ageYears: hit.born_on === undefined ? null : ageFromDay(hit.born_on, today),
      verified: hit.verified,
      avatarUrls: hit.avatar_media_id ? this.avatarUrls(hit.id, hit.avatar_media_id) : null,
    };
  }
}
