import type { InMemoryPortfolioRepository } from '../../portfolio/testing/in-memory-portfolio.repository.js';
import { TalentProfile } from '../../talent-profiles/domain/talent-profile.js';
import type { InMemoryTalentProfileRepository } from '../../talent-profiles/testing/in-memory-talent-profile.repository.js';
import type {
  Follow,
  FollowRepository,
  LikeRepository,
  PostPageRequest,
  PostRow,
  PostSource,
} from '../domain/social.js';

export class InMemoryFollowRepository implements FollowRepository {
  readonly rows: Follow[] = [];

  isFollowing(followerId: string, talentId: string): Promise<boolean> {
    return Promise.resolve(
      this.rows.some((row) => row.followerId === followerId && row.talentId === talentId),
    );
  }

  async add(follow: Follow): Promise<boolean> {
    if (await this.isFollowing(follow.followerId, follow.talentId)) return false;
    this.rows.push(follow);
    return true;
  }

  remove(followerId: string, talentId: string): Promise<void> {
    const index = this.rows.findIndex(
      (row) => row.followerId === followerId && row.talentId === talentId,
    );
    if (index >= 0) this.rows.splice(index, 1);
    return Promise.resolve();
  }

  countFollowers(talentId: string): Promise<number> {
    return Promise.resolve(this.rows.filter((row) => row.talentId === talentId).length);
  }

  countFollowing(followerId: string): Promise<number> {
    return Promise.resolve(this.rows.filter((row) => row.followerId === followerId).length);
  }

  followingPage(
    followerId: string,
    after: { followedAt: Date; talentId: string } | null,
    limit: number,
  ): Promise<Follow[]> {
    const sorted = this.rows
      .filter((row) => row.followerId === followerId)
      .sort(
        (a, b) =>
          b.followedAt.getTime() - a.followedAt.getTime() || b.talentId.localeCompare(a.talentId),
      );
    const rest = after
      ? sorted.filter(
          (row) =>
            row.followedAt < after.followedAt ||
            (row.followedAt.getTime() === after.followedAt.getTime() &&
              row.talentId < after.talentId),
        )
      : sorted;
    return Promise.resolve(rest.slice(0, limit));
  }
}

export class InMemoryLikeRepository implements LikeRepository {
  readonly rows = new Set<string>();
  private key = (userId: string, itemId: string) => `${userId}|${itemId}`;

  add(like: { userId: string; itemId: string }): Promise<void> {
    this.rows.add(this.key(like.userId, like.itemId));
    return Promise.resolve();
  }

  remove(userId: string, itemId: string): Promise<void> {
    this.rows.delete(this.key(userId, itemId));
    return Promise.resolve();
  }

  counts(itemIds: readonly string[]): Promise<Map<string, number>> {
    const totals = new Map<string, number>();
    for (const key of this.rows) {
      const itemId = key.split('|')[1] ?? '';
      if (itemIds.includes(itemId)) totals.set(itemId, (totals.get(itemId) ?? 0) + 1);
    }
    return Promise.resolve(totals);
  }

  likedBy(userId: string, itemIds: readonly string[]): Promise<Set<string>> {
    return Promise.resolve(
      new Set(itemIds.filter((itemId) => this.rows.has(this.key(userId, itemId)))),
    );
  }
}

/**
 * Reads the in-memory portfolios directly. It does not check that files are ready or that
 * the talent is visible: the use cases do that again, which is what the tests exercise.
 */
export class InMemoryPostSource implements PostSource {
  constructor(
    private readonly portfolios: InMemoryPortfolioRepository,
    private readonly profiles: InMemoryTalentProfileRepository,
    private readonly follows: InMemoryFollowRepository,
  ) {}

  private all(): PostRow[] {
    return [...this.portfolios.rows.values()]
      .flatMap((portfolio) =>
        portfolio.items.map((item) => ({
          itemId: item.id,
          talentId: portfolio.talentId,
          mediaId: item.mediaId,
          kind: item.kind,
          caption: item.caption,
          postedAt: item.createdAt,
        })),
      )
      .sort(
        (a, b) => b.postedAt.getTime() - a.postedAt.getTime() || b.itemId.localeCompare(a.itemId),
      );
  }

  page({ scope, viewerId, after, limit }: PostPageRequest): Promise<PostRow[]> {
    const followed = new Set(
      this.follows.rows.filter((row) => row.followerId === viewerId).map((row) => row.talentId),
    );
    const rows = this.all()
      .filter((row) =>
        typeof scope === 'object'
          ? row.talentId === scope.talentId
          : scope === 'discover' || followed.has(row.talentId),
      )
      .filter(
        (row) =>
          !after ||
          row.postedAt < after.postedAt ||
          (row.postedAt.getTime() === after.postedAt.getTime() && row.itemId < after.itemId),
      );
    return Promise.resolve(rows.slice(0, limit));
  }

  find(itemId: string): Promise<PostRow | null> {
    return Promise.resolve(this.all().find((row) => row.itemId === itemId) ?? null);
  }

  countFor(talentId: string): Promise<number> {
    return Promise.resolve(this.portfolios.rows.get(talentId)?.items.length ?? 0);
  }

  suggestions(viewerId: string, limit: number): Promise<string[]> {
    const followed = new Set(
      this.follows.rows.filter((row) => row.followerId === viewerId).map((row) => row.talentId),
    );
    return Promise.resolve(
      [...this.profiles.rows.values()]
        .filter((row) => TalentProfile.restore(row).isComplete)
        .filter((row) => row.userId !== viewerId && !followed.has(row.userId))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .map((row) => row.userId)
        .slice(0, limit),
    );
  }
}
