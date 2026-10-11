import { and, asc, count, desc, eq, exists, ilike, inArray, isNotNull, lt, or } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import { users } from '../../accounts/infrastructure/account.schema.js';
import { cities } from '../../taxonomy/infrastructure/taxonomy.schema.js';
import {
  AgentProfile,
  type AgentListing,
  type AgentListingFilter,
  type ListingCursor,
  type SavedAgent,
  type SavedAgentRepository,
} from '../domain/agent-profile.js';
import { agentProfiles, agentSpecializations, savedAgents } from './agent-profile.schema.js';

/** Makes what someone typed a literal for LIKE: their % and _ match themselves. */
const literal = (text: string) => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * The directory of agents talent can browse. It reads the account's status from the accounts
 * schema in the same query, so a suspended agent never takes a place on a page (the same
 * read-only join the feed makes, ADR-047).
 */
export class DrizzleAgentListing implements AgentListing {
  constructor(private readonly uow: DrizzleUnitOfWork) {}

  private readonly listed = and(
    isNotNull(agentProfiles.verifiedAt),
    isNotNull(agentProfiles.completedAt),
    eq(users.status, 'active'),
  );

  async search(
    filter: AgentListingFilter,
    after: ListingCursor | null,
    limit: number,
  ): Promise<AgentProfile[]> {
    const db = this.uow.executor();
    const pattern = filter.text ? literal(filter.text) : null;
    const rows = await db
      .select({ profile: agentProfiles })
      .from(agentProfiles)
      .innerJoin(users, eq(users.id, agentProfiles.userId))
      .where(
        and(
          this.listed,
          pattern
            ? or(
                ilike(agentProfiles.agencyName, pattern),
                ilike(agentProfiles.jobTitle, pattern),
                ilike(agentProfiles.bio, pattern),
              )
            : undefined,
          filter.citySlug ? eq(agentProfiles.citySlug, filter.citySlug) : undefined,
          filter.countryCode
            ? inArray(
                agentProfiles.citySlug,
                db
                  .select({ slug: cities.slug })
                  .from(cities)
                  .where(eq(cities.countryCode, filter.countryCode)),
              )
            : undefined,
          filter.categorySlug
            ? exists(
                db
                  .select({ userId: agentSpecializations.userId })
                  .from(agentSpecializations)
                  .where(
                    and(
                      eq(agentSpecializations.userId, agentProfiles.userId),
                      eq(agentSpecializations.categorySlug, filter.categorySlug),
                    ),
                  ),
              )
            : undefined,
          filter.openOnly ? eq(agentProfiles.rosterStatus, 'open') : undefined,
          after
            ? or(
                lt(agentProfiles.verifiedAt, after.verifiedAt),
                and(
                  eq(agentProfiles.verifiedAt, after.verifiedAt),
                  lt(agentProfiles.userId, after.agentId),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(desc(agentProfiles.verifiedAt), desc(agentProfiles.userId))
      .limit(limit);
    return this.withSpecializations(rows.map((row) => row.profile));
  }

  async listedAmong(agentIds: readonly string[]): Promise<AgentProfile[]> {
    if (agentIds.length === 0) return [];
    const rows = await this.uow
      .executor()
      .select({ profile: agentProfiles })
      .from(agentProfiles)
      .innerJoin(users, eq(users.id, agentProfiles.userId))
      .where(and(this.listed, inArray(agentProfiles.userId, [...agentIds])));
    return this.withSpecializations(rows.map((row) => row.profile));
  }

  /** One query for every profile's categories, rather than one each. */
  private async withSpecializations(
    rows: readonly (typeof agentProfiles.$inferSelect)[],
  ): Promise<AgentProfile[]> {
    if (rows.length === 0) return [];
    const specializations = await this.uow
      .executor()
      .select()
      .from(agentSpecializations)
      .where(
        inArray(
          agentSpecializations.userId,
          rows.map((row) => row.userId),
        ),
      )
      .orderBy(asc(agentSpecializations.position));
    return rows.map((row) =>
      AgentProfile.restore({
        ...row,
        specializationSlugs: specializations
          .filter((item) => item.userId === row.userId)
          .map((item) => item.categorySlug),
      }),
    );
  }
}

export class DrizzleSavedAgentRepository implements SavedAgentRepository {
  constructor(private readonly uow: DrizzleUnitOfWork) {}

  async save(entry: SavedAgent): Promise<void> {
    // saved_at is left alone on a repeat: the first save is the one that counts.
    await this.uow.executor().insert(savedAgents).values(entry).onConflictDoNothing();
  }

  async remove(userId: string, agentId: string): Promise<void> {
    await this.uow
      .executor()
      .delete(savedAgents)
      .where(and(eq(savedAgents.userId, userId), eq(savedAgents.agentId, agentId)));
  }

  async count(userId: string): Promise<number> {
    const [row] = await this.uow
      .executor()
      .select({ total: count() })
      .from(savedAgents)
      .where(eq(savedAgents.userId, userId));
    return row?.total ?? 0;
  }

  async savedAmong(userId: string, agentIds: readonly string[]): Promise<Set<string>> {
    if (agentIds.length === 0) return new Set();
    const rows = await this.uow
      .executor()
      .select({ agentId: savedAgents.agentId })
      .from(savedAgents)
      .where(and(eq(savedAgents.userId, userId), inArray(savedAgents.agentId, [...agentIds])));
    return new Set(rows.map((row) => row.agentId));
  }

  async page(
    userId: string,
    after: { savedAt: Date; agentId: string } | null,
    limit: number,
  ): Promise<SavedAgent[]> {
    const mine = eq(savedAgents.userId, userId);
    return this.uow
      .executor()
      .select()
      .from(savedAgents)
      .where(
        after
          ? and(
              mine,
              or(
                lt(savedAgents.savedAt, after.savedAt),
                and(eq(savedAgents.savedAt, after.savedAt), lt(savedAgents.agentId, after.agentId)),
              ),
            )
          : mine,
      )
      .orderBy(desc(savedAgents.savedAt), desc(savedAgents.agentId))
      .limit(limit);
  }

  async all(userId: string): Promise<SavedAgent[]> {
    return this.uow
      .executor()
      .select()
      .from(savedAgents)
      .where(eq(savedAgents.userId, userId))
      .orderBy(desc(savedAgents.savedAt));
  }
}
