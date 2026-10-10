import { and, count, desc, eq, inArray, isNotNull, lt, ne, notExists, or, sql } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import { users } from '../../accounts/infrastructure/account.schema.js';
import { assets } from '../../media/infrastructure/media.schema.js';
import { portfolioItems } from '../../portfolio/infrastructure/portfolio.schema.js';
import { profiles } from '../../talent-profiles/infrastructure/talent-profile.schema.js';
import type {
  Follow,
  FollowRepository,
  LikeRepository,
  PostPageRequest,
  PostRow,
  PostSource,
} from '../domain/social.js';
import { follows, likes } from './social.schema.js';

export class DrizzleFollowRepository implements FollowRepository {
  constructor(private readonly uow: DrizzleUnitOfWork) {}

  async isFollowing(followerId: string, talentId: string): Promise<boolean> {
    const [row] = await this.uow
      .executor()
      .select({ talentId: follows.talentId })
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.talentId, talentId)))
      .limit(1);
    return row !== undefined;
  }

  async add(follow: Follow): Promise<boolean> {
    const created = await this.uow
      .executor()
      .insert(follows)
      .values(follow)
      .onConflictDoNothing()
      .returning({ talentId: follows.talentId });
    return created.length > 0;
  }

  async remove(followerId: string, talentId: string): Promise<void> {
    await this.uow
      .executor()
      .delete(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.talentId, talentId)));
  }

  async countFollowers(talentId: string): Promise<number> {
    const [row] = await this.uow
      .executor()
      .select({ total: count() })
      .from(follows)
      .where(eq(follows.talentId, talentId));
    return row?.total ?? 0;
  }

  async countFollowing(followerId: string): Promise<number> {
    const [row] = await this.uow
      .executor()
      .select({ total: count() })
      .from(follows)
      .where(eq(follows.followerId, followerId));
    return row?.total ?? 0;
  }

  async followingPage(
    followerId: string,
    after: { followedAt: Date; talentId: string } | null,
    limit: number,
  ): Promise<Follow[]> {
    const mine = eq(follows.followerId, followerId);
    return this.uow
      .executor()
      .select()
      .from(follows)
      .where(
        after
          ? and(
              mine,
              or(
                lt(follows.followedAt, after.followedAt),
                and(eq(follows.followedAt, after.followedAt), lt(follows.talentId, after.talentId)),
              ),
            )
          : mine,
      )
      .orderBy(desc(follows.followedAt), desc(follows.talentId))
      .limit(limit);
  }
}

export class DrizzleLikeRepository implements LikeRepository {
  constructor(private readonly uow: DrizzleUnitOfWork) {}

  async add(like: { userId: string; itemId: string; likedAt: Date }): Promise<void> {
    await this.uow.executor().insert(likes).values(like).onConflictDoNothing();
  }

  async remove(userId: string, itemId: string): Promise<void> {
    await this.uow
      .executor()
      .delete(likes)
      .where(and(eq(likes.userId, userId), eq(likes.itemId, itemId)));
  }

  async counts(itemIds: readonly string[]): Promise<Map<string, number>> {
    if (itemIds.length === 0) return new Map();
    const rows = await this.uow
      .executor()
      .select({ itemId: likes.itemId, total: count() })
      .from(likes)
      .where(inArray(likes.itemId, [...itemIds]))
      .groupBy(likes.itemId);
    return new Map(rows.map((row) => [row.itemId, row.total]));
  }

  async likedBy(userId: string, itemIds: readonly string[]): Promise<Set<string>> {
    if (itemIds.length === 0) return new Set();
    const rows = await this.uow
      .executor()
      .select({ itemId: likes.itemId })
      .from(likes)
      .where(and(eq(likes.userId, userId), inArray(likes.itemId, [...itemIds])));
    return new Set(rows.map((row) => row.itemId));
  }
}

/** A talent others can see: a complete profile on an active, verified account (ADR-037). */
const visibleTalent = and(
  eq(profiles.isComplete, true),
  eq(users.status, 'active'),
  isNotNull(users.emailVerifiedAt),
);

/**
 * Reads across the portfolio, media, talent and account tables in one query, because a feed
 * page assembled module by module would mean a query per row. It only reads; each module
 * still owns its own writes (ADR-047).
 */
export class DrizzlePostSource implements PostSource {
  constructor(private readonly uow: DrizzleUnitOfWork) {}

  private posts() {
    return this.uow
      .executor()
      .select({
        itemId: portfolioItems.id,
        talentId: portfolioItems.talentId,
        mediaId: portfolioItems.mediaId,
        kind: portfolioItems.kind,
        caption: portfolioItems.caption,
        postedAt: portfolioItems.createdAt,
      })
      .from(portfolioItems)
      .innerJoin(assets, and(eq(assets.id, portfolioItems.mediaId), eq(assets.status, 'ready')))
      .innerJoin(profiles, eq(profiles.userId, portfolioItems.talentId))
      .innerJoin(users, eq(users.id, portfolioItems.talentId));
  }

  async page({ scope, viewerId, after, limit }: PostPageRequest): Promise<PostRow[]> {
    const within =
      typeof scope === 'object'
        ? eq(portfolioItems.talentId, scope.talentId)
        : scope === 'following'
          ? inArray(
              portfolioItems.talentId,
              this.uow
                .executor()
                .select({ talentId: follows.talentId })
                .from(follows)
                .where(eq(follows.followerId, viewerId)),
            )
          : undefined;
    const before = after
      ? or(
          lt(portfolioItems.createdAt, after.postedAt),
          and(eq(portfolioItems.createdAt, after.postedAt), lt(portfolioItems.id, after.itemId)),
        )
      : undefined;
    return this.posts()
      .where(and(visibleTalent, within, before))
      .orderBy(desc(portfolioItems.createdAt), desc(portfolioItems.id))
      .limit(limit);
  }

  async find(itemId: string): Promise<PostRow | null> {
    const [row] = await this.posts()
      .where(and(visibleTalent, eq(portfolioItems.id, itemId)))
      .limit(1);
    return row ?? null;
  }

  async countFor(talentId: string): Promise<number> {
    const [row] = await this.uow
      .executor()
      .select({ total: count() })
      .from(portfolioItems)
      .innerJoin(assets, and(eq(assets.id, portfolioItems.mediaId), eq(assets.status, 'ready')))
      .where(eq(portfolioItems.talentId, talentId));
    return row?.total ?? 0;
  }

  async suggestions(viewerId: string, limit: number): Promise<string[]> {
    const rows = await this.uow
      .executor()
      .select({ userId: profiles.userId })
      .from(profiles)
      .innerJoin(users, eq(users.id, profiles.userId))
      .where(
        and(
          visibleTalent,
          ne(profiles.userId, viewerId),
          notExists(
            this.uow
              .executor()
              .select({ one: sql`1` })
              .from(follows)
              .where(and(eq(follows.followerId, viewerId), eq(follows.talentId, profiles.userId))),
          ),
        ),
      )
      .orderBy(desc(profiles.completedAt), desc(profiles.userId))
      .limit(limit);
    return rows.map((row) => row.userId);
  }
}
