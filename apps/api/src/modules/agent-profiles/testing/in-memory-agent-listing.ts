import {
  AgentProfile,
  type AgentListing,
  type AgentListingFilter,
  type ListingCursor,
  type SavedAgent,
  type SavedAgentRepository,
} from '../domain/agent-profile.js';
import type { InMemoryAgentProfileRepository } from './in-memory-agent-profile.repository.js';

/** The directory over the in-memory profiles. City slugs start with the country: ng-lagos. */
export class InMemoryAgentListing implements AgentListing {
  constructor(
    private readonly profiles: InMemoryAgentProfileRepository,
    private readonly isActive: (userId: string) => boolean | Promise<boolean> = () => true,
  ) {}

  private async listed(): Promise<AgentProfile[]> {
    const all = [...this.profiles.rows.values()].map((row) => AgentProfile.restore(row));
    const active = await Promise.all(
      all.map((profile) => Promise.resolve(this.isActive(profile.userId))),
    );
    return all.filter((profile, index) => profile.isListed && active[index]);
  }

  async search(
    filter: AgentListingFilter,
    after: ListingCursor | null,
    limit: number,
  ): Promise<AgentProfile[]> {
    const text = filter.text?.toLowerCase() ?? null;
    return (await this.listed())
      .filter((profile) => {
        const props = profile.snapshot();
        const verifiedAt = props.verifiedAt?.getTime() ?? 0;
        return (
          (!text ||
            [props.agencyName, props.jobTitle, props.bio].some((value) =>
              value?.toLowerCase().includes(text),
            )) &&
          (!filter.citySlug || props.citySlug === filter.citySlug) &&
          (!filter.countryCode ||
            props.citySlug?.startsWith(`${filter.countryCode.toLowerCase()}-`)) &&
          (!filter.categorySlug || props.specializationSlugs.includes(filter.categorySlug)) &&
          (!filter.openOnly || props.rosterStatus === 'open') &&
          (!after ||
            verifiedAt < after.verifiedAt.getTime() ||
            (verifiedAt === after.verifiedAt.getTime() && props.userId < after.agentId))
        );
      })
      .sort((a, b) => {
        const [left, right] = [a.snapshot(), b.snapshot()];
        return (
          (right.verifiedAt?.getTime() ?? 0) - (left.verifiedAt?.getTime() ?? 0) ||
          right.userId.localeCompare(left.userId)
        );
      })
      .slice(0, limit);
  }

  async listedAmong(agentIds: readonly string[]): Promise<AgentProfile[]> {
    return (await this.listed()).filter((profile) => agentIds.includes(profile.userId));
  }
}

export class InMemorySavedAgentRepository implements SavedAgentRepository {
  readonly rows = new Map<string, SavedAgent>();
  private key = (userId: string, agentId: string) => `${userId}|${agentId}`;

  save(entry: SavedAgent): Promise<void> {
    const key = this.key(entry.userId, entry.agentId);
    if (!this.rows.has(key)) this.rows.set(key, entry);
    return Promise.resolve();
  }

  remove(userId: string, agentId: string): Promise<void> {
    this.rows.delete(this.key(userId, agentId));
    return Promise.resolve();
  }

  private mine(userId: string): SavedAgent[] {
    return [...this.rows.values()]
      .filter((row) => row.userId === userId)
      .sort(
        (a, b) => b.savedAt.getTime() - a.savedAt.getTime() || b.agentId.localeCompare(a.agentId),
      );
  }

  count(userId: string): Promise<number> {
    return Promise.resolve(this.mine(userId).length);
  }

  savedAmong(userId: string, agentIds: readonly string[]): Promise<Set<string>> {
    return Promise.resolve(
      new Set(agentIds.filter((agentId) => this.rows.has(this.key(userId, agentId)))),
    );
  }

  page(
    userId: string,
    after: { savedAt: Date; agentId: string } | null,
    limit: number,
  ): Promise<SavedAgent[]> {
    return Promise.resolve(
      this.mine(userId)
        .filter(
          (row) =>
            !after ||
            row.savedAt < after.savedAt ||
            (row.savedAt.getTime() === after.savedAt.getTime() && row.agentId < after.agentId),
        )
        .slice(0, limit),
    );
  }

  all(userId: string): Promise<SavedAgent[]> {
    return Promise.resolve(this.mine(userId));
  }
}
