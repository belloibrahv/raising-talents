import {
  AGENT_PAGE_SIZE,
  ErrorCode,
  SAVED_AGENTS_MAX,
  type AccountStatus,
  type AgentCard,
  type AgentPage,
  type DataExport,
  type ImageUrls,
  type PublicAgentProfile,
  type Role,
  type SavedAgentState,
  type SearchAgentsQuery,
} from '@rt/contracts';
import type { Clock } from '../../../platform/clock.js';
import { decodeCursor, encodeCursor } from '../../../platform/cursor.js';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type {
  TaxonomyCatalog,
  TaxonomySource,
} from '../../taxonomy/application/taxonomy-catalog.js';
import type {
  AgentListing,
  AgentProfile,
  AgentProfileRepository,
  SavedAgentRepository,
} from '../domain/agent-profile.js';

export const AGENT_DIRECTORY = {
  Listing: Symbol('AgentListing'),
  Saved: Symbol('SavedAgentRepository'),
  Accounts: Symbol('AgentDirectoryAccounts'),
  Search: Symbol('SearchAgentsQuery'),
  Get: Symbol('GetAgentQuery'),
  Save: Symbol('SaveAgentHandler'),
  Unsave: Symbol('UnsaveAgentHandler'),
  ListSaved: Symbol('ListSavedAgentsQuery'),
  Export: Symbol('SavedAgentsExport'),
} as const;

export const AGENT_SEARCH_LIMIT = { perMinute: 60, windowSeconds: 60 } as const;

/** What the directory needs from accounts. Implemented by AccountsFacade. */
export interface AgentDirectoryAccounts {
  profileContext(userId: string): Promise<{ role: Role | null; status: AccountStatus } | null>;
}

export type AgentAvatarUrls = (ownerId: string, mediaId: string) => ImageUrls;

export const AgentDirectoryErrors = {
  notActive: () =>
    domainError(ErrorCode.Forbidden, 'Finish setting up your profile to look for agents.'),
  notFound: () => domainError(ErrorCode.NotFound, 'This agent is not available.'),
  talentOnly: () => domainError(ErrorCode.WrongRole, 'Only talent save agents.'),
  full: () =>
    domainError(
      ErrorCode.Conflict,
      `You can save ${String(SAVED_AGENTS_MAX)} agents. Remove one to save another.`,
    ),
  tooFast: (retryAfterSeconds: number) =>
    domainError(ErrorCode.RateLimited, 'You are going too fast. Wait a moment.', retryAfterSeconds),
};

/** Anyone who has finished setting up, whatever their role, can look agents up. */
async function ensureMember(
  accounts: AgentDirectoryAccounts,
  userId: string,
): Promise<DomainError | null> {
  const account = await accounts.profileContext(userId);
  return account?.role && account.status === 'active' ? null : AgentDirectoryErrors.notActive();
}

async function ensureTalent(
  accounts: AgentDirectoryAccounts,
  userId: string,
): Promise<DomainError | null> {
  const account = await accounts.profileContext(userId);
  return account?.role === 'talent' ? null : AgentDirectoryErrors.talentOnly();
}

/** The card, or null for a profile that cannot be listed (no name or city yet). */
export function toAgentCard(
  profile: AgentProfile,
  catalog: TaxonomyCatalog,
  urls: AgentAvatarUrls,
  saved: boolean,
): AgentCard | null {
  const props = profile.snapshot();
  const city = catalog.city(props.citySlug);
  if (!props.agencyName || !props.jobTitle || !city) return null;
  return {
    id: props.userId,
    agencyName: props.agencyName,
    jobTitle: props.jobTitle,
    city,
    specializations: catalog.categoryRefs(props.specializationSlugs),
    verified: props.verifiedAt !== null,
    rosterStatus: props.rosterStatus,
    avatarUrls: props.avatarMediaId ? urls(props.userId, props.avatarMediaId) : null,
    saved,
  };
}

export class SearchAgentsHandler {
  constructor(
    private readonly listing: AgentListing,
    private readonly saved: SavedAgentRepository,
    private readonly accounts: AgentDirectoryAccounts,
    private readonly taxonomy: TaxonomySource,
    private readonly urls: AgentAvatarUrls,
    private readonly rateLimiter: RateLimiter,
  ) {}

  async execute(
    viewerId: string,
    query: SearchAgentsQuery,
  ): Promise<Result<AgentPage, DomainError>> {
    const refused = await ensureMember(this.accounts, viewerId);
    if (refused) return err(refused);
    const limit = await this.rateLimiter.consume(
      `agents-search:${viewerId}`,
      AGENT_SEARCH_LIMIT.perMinute,
      AGENT_SEARCH_LIMIT.windowSeconds,
    );
    if (!limit.allowed) return err(AgentDirectoryErrors.tooFast(limit.retryAfterSeconds));

    const after = decodeCursor(query.cursor);
    const rows = await this.listing.search(
      {
        text: query.q ? query.q : null,
        categorySlug: query.category ?? null,
        countryCode: query.country ?? null,
        citySlug: query.city ?? null,
        openOnly: query.open === 'true',
      },
      after ? { verifiedAt: after.at, agentId: after.id } : null,
      AGENT_PAGE_SIZE + 1,
    );
    const page = rows.slice(0, AGENT_PAGE_SIZE);
    const [catalog, savedIds] = await Promise.all([
      this.taxonomy.current(),
      this.saved.savedAmong(
        viewerId,
        page.map((profile) => profile.userId),
      ),
    ]);
    const last = page.at(-1)?.snapshot();
    return ok({
      items: page.flatMap((profile) => {
        const card = toAgentCard(profile, catalog, this.urls, savedIds.has(profile.userId));
        return card ? [card] : [];
      }),
      nextCursor:
        rows.length > AGENT_PAGE_SIZE && last?.verifiedAt
          ? encodeCursor(last.verifiedAt, last.userId)
          : null,
    });
  }
}

/**
 * One agent's page. Unlisted, suspended and unknown agents all answer the same 404, so a
 * viewer cannot tell which. Agents always see their own, to check it before it is listed.
 */
export class GetAgentQuery {
  constructor(
    private readonly profiles: AgentProfileRepository,
    private readonly listing: AgentListing,
    private readonly saved: SavedAgentRepository,
    private readonly accounts: AgentDirectoryAccounts,
    private readonly taxonomy: TaxonomySource,
    private readonly urls: AgentAvatarUrls,
  ) {}

  async execute(
    viewerId: string,
    agentId: string,
  ): Promise<Result<PublicAgentProfile, DomainError>> {
    const isSelf = viewerId === agentId;
    if (!isSelf) {
      const refused = await ensureMember(this.accounts, viewerId);
      if (refused) return err(refused);
    }
    const profile = isSelf
      ? await this.profiles.findByUserId(agentId)
      : ((await this.listing.listedAmong([agentId]))[0] ?? null);
    if (!profile) return err(AgentDirectoryErrors.notFound());
    const saved = isSelf ? new Set<string>() : await this.saved.savedAmong(viewerId, [agentId]);
    const card = toAgentCard(profile, await this.taxonomy.current(), this.urls, saved.has(agentId));
    if (!card) return err(AgentDirectoryErrors.notFound());
    const props = profile.snapshot();
    return ok({
      ...card,
      bio: props.bio,
      website: props.website,
      avatarMediaId: props.avatarMediaId,
      memberSince: props.createdAt.toISOString(),
      isSelf,
    });
  }
}

export class SaveAgentHandler {
  constructor(
    private readonly listing: AgentListing,
    private readonly saved: SavedAgentRepository,
    private readonly accounts: AgentDirectoryAccounts,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, agentId: string): Promise<Result<SavedAgentState, DomainError>> {
    const refused =
      (await ensureTalent(this.accounts, userId)) ?? (await ensureMember(this.accounts, userId));
    if (refused) return err(refused);
    const [agent] = await this.listing.listedAmong([agentId]);
    if (!agent) return err(AgentDirectoryErrors.notFound());
    const already = (await this.saved.savedAmong(userId, [agentId])).has(agentId);
    // The limit counts new saves only; saving someone twice changes nothing.
    if (!already && (await this.saved.count(userId)) >= SAVED_AGENTS_MAX) {
      return err(AgentDirectoryErrors.full());
    }
    await this.saved.save({ userId, agentId, savedAt: this.clock.now() });
    return ok({ saved: true });
  }
}

/** Works for agents who are hidden now, so a talent can always tidy their own list. */
export class UnsaveAgentHandler {
  constructor(
    private readonly saved: SavedAgentRepository,
    private readonly accounts: AgentDirectoryAccounts,
  ) {}

  async execute(userId: string, agentId: string): Promise<Result<SavedAgentState, DomainError>> {
    const refused = await ensureTalent(this.accounts, userId);
    if (refused) return err(refused);
    await this.saved.remove(userId, agentId);
    return ok({ saved: false });
  }
}

/** Saved agents as they are now. One who is no longer listed is left out, not removed. */
export class ListSavedAgentsQuery {
  constructor(
    private readonly listing: AgentListing,
    private readonly saved: SavedAgentRepository,
    private readonly accounts: AgentDirectoryAccounts,
    private readonly taxonomy: TaxonomySource,
    private readonly urls: AgentAvatarUrls,
  ) {}

  async execute(userId: string, cursor?: string): Promise<Result<AgentPage, DomainError>> {
    const refused = await ensureTalent(this.accounts, userId);
    if (refused) return err(refused);
    const after = decodeCursor(cursor);
    const rows = await this.saved.page(
      userId,
      after ? { savedAt: after.at, agentId: after.id } : null,
      AGENT_PAGE_SIZE + 1,
    );
    const page = rows.slice(0, AGENT_PAGE_SIZE);
    const [profiles, catalog] = await Promise.all([
      this.listing.listedAmong(page.map((row) => row.agentId)),
      this.taxonomy.current(),
    ]);
    const byId = new Map(profiles.map((profile) => [profile.userId, profile]));
    const last = page.at(-1);
    return ok({
      items: page.flatMap((row) => {
        const profile = byId.get(row.agentId);
        const card = profile ? toAgentCard(profile, catalog, this.urls, true) : null;
        return card ? [card] : [];
      }),
      nextCursor:
        rows.length > AGENT_PAGE_SIZE && last ? encodeCursor(last.savedAt, last.agentId) : null,
    });
  }
}

/** The talent's saved agents for their data export (ADR-027). */
export class SavedAgentsExport {
  constructor(
    private readonly saved: SavedAgentRepository,
    private readonly profiles: AgentProfileRepository,
  ) {}

  async forUser(userId: string): Promise<DataExport['savedAgents']> {
    const rows = await this.saved.all(userId);
    return Promise.all(
      rows.map(async (row) => ({
        agencyName: (await this.profiles.findByUserId(row.agentId))?.snapshot().agencyName ?? null,
        savedAt: row.savedAt.toISOString(),
      })),
    );
  }
}
