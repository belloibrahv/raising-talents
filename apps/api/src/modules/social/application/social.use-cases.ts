import {
  ErrorCode,
  FEED_PAGE_SIZE,
  FOLLOW_PAGE_SIZE,
  FOLLOWING_MAX,
  SUGGESTIONS_MAX,
  type AccountStatus,
  type FeedScope,
  type ImageUrls,
  type LikeState,
  type MediaStatus,
  type Post,
  type PostPage,
  type Role,
  type Suggestions,
  type TalentCard,
  type TalentCardPage,
  type TalentSocial,
  type VideoPlayback,
} from '@rt/contracts';
import type { Clock } from '../../../platform/clock.js';
import { decodeCursor, encodeCursor } from '../../../platform/cursor.js';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import type { EventRecorder } from '../../../platform/domain-event.js';
import type { RateLimiter } from '../../../platform/rate-limit/rate-limiter.js';
import { err, ok, type Result } from '../../../platform/result.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import {
  SocialEvents,
  type FollowRepository,
  type LikeRepository,
  type PostRow,
  type PostSource,
} from '../domain/social.js';

export const SOCIAL = {
  Follows: Symbol('FollowRepository'),
  Likes: Symbol('LikeRepository'),
  Posts: Symbol('PostSource'),
  Feed: Symbol('FeedQuery'),
  TalentPosts: Symbol('TalentPostsQuery'),
  TalentSocial: Symbol('TalentSocialQuery'),
  Suggestions: Symbol('SuggestionsQuery'),
  Following: Symbol('FollowingQuery'),
  Follow: Symbol('FollowTalentHandler'),
  Unfollow: Symbol('UnfollowTalentHandler'),
  Like: Symbol('LikePostHandler'),
  Unlike: Symbol('UnlikePostHandler'),
  Export: Symbol('SocialExport'),
} as const;

/** What social needs from accounts. Implemented by AccountsFacade. */
export interface SocialAccounts {
  profileContext(userId: string): Promise<{ role: Role | null; status: AccountStatus } | null>;
}

/** What social needs from talent profiles. Implemented by TalentDirectory. */
export interface SocialTalents {
  visibleUserId(handle: string): Promise<string | null>;
  userIdOf(handle: string): Promise<string | null>;
  cardFor(userId: string): Promise<TalentCard | null>;
  handleOf(userId: string): Promise<string | null>;
  nameOf(userId: string): Promise<{ displayName: string } | null>;
}

/** What social needs from agent profiles. Implemented by AgentDirectory. */
export interface SocialAgents {
  summaryOf(agentId: string): Promise<{ agencyName: string } | null>;
}

/** What social needs from media. Implemented by MediaFacade. */
export interface SocialMedia {
  describe(
    ids: readonly string[],
  ): Promise<
    Map<string, { status: MediaStatus; urls: ImageUrls | null; video: VideoPlayback | null }>
  >;
}

export const FOLLOW_LIMIT = { perUser: 60, windowSeconds: 60 } as const;
export const LIKE_LIMIT = { perUser: 120, windowSeconds: 60 } as const;

export const SocialErrors = {
  notActive: () =>
    domainError(ErrorCode.Forbidden, 'Finish setting up your profile to follow and like.'),
  notFound: () => domainError(ErrorCode.NotFound, 'This profile is not available.'),
  postNotFound: () => domainError(ErrorCode.NotFound, 'This post is not available.'),
  self: () => domainError(ErrorCode.Forbidden, 'You cannot follow yourself.'),
  full: () =>
    domainError(
      ErrorCode.Forbidden,
      `You can follow up to ${String(FOLLOWING_MAX)} people. Unfollow someone to follow another.`,
    ),
  tooFast: (retryAfterSeconds: number) =>
    domainError(ErrorCode.RateLimited, 'You are going too fast. Wait a moment.', retryAfterSeconds),
};

/** Anyone who has finished setting up, whatever their role, takes part. */
async function ensureMember(accounts: SocialAccounts, userId: string): Promise<DomainError | null> {
  const account = await accounts.profileContext(userId);
  return account?.role && account.status === 'active' ? null : SocialErrors.notActive();
}

/**
 * Turns feed rows into posts: who posted, the file, and the likes. A row whose talent is no
 * longer visible or whose file is not ready is dropped here, whatever the query returned.
 */
export class PostAssembler {
  constructor(
    private readonly talents: SocialTalents,
    private readonly media: SocialMedia,
    private readonly likes: LikeRepository,
  ) {}

  async assemble(rows: readonly PostRow[], viewerId: string): Promise<Post[]> {
    const itemIds = rows.map((row) => row.itemId);
    const talentIds = [...new Set(rows.map((row) => row.talentId))];
    const [files, counts, liked, cards] = await Promise.all([
      this.media.describe(rows.map((row) => row.mediaId)),
      this.likes.counts(itemIds),
      this.likes.likedBy(viewerId, itemIds),
      Promise.all(talentIds.map((id) => this.talents.cardFor(id))),
    ]);
    const cardOf = new Map(talentIds.map((id, index) => [id, cards[index] ?? null]));
    return rows.flatMap((row): Post[] => {
      const talent = cardOf.get(row.talentId);
      const file = files.get(row.mediaId);
      if (!talent || file?.status !== 'ready') return [];
      const shared = {
        id: row.itemId,
        caption: row.caption,
        postedAt: row.postedAt.toISOString(),
        talent,
        likes: counts.get(row.itemId) ?? 0,
        liked: liked.has(row.itemId),
      };
      if (file.urls) return [{ ...shared, kind: 'image', urls: file.urls }];
      if (file.video) return [{ ...shared, kind: 'video', video: file.video }];
      return [];
    });
  }
}

async function postPage(
  posts: PostSource,
  assembler: PostAssembler,
  scope: FeedScope | { talentId: string },
  viewerId: string,
  cursor: string | undefined,
): Promise<PostPage> {
  const after = decodeCursor(cursor);
  const rows = await posts.page({
    scope,
    viewerId,
    after: after ? { postedAt: after.at, itemId: after.id } : null,
    limit: FEED_PAGE_SIZE + 1,
  });
  const page = rows.slice(0, FEED_PAGE_SIZE);
  const last = page.at(-1);
  return {
    items: await assembler.assemble(page, viewerId),
    nextCursor:
      rows.length > FEED_PAGE_SIZE && last ? encodeCursor(last.postedAt, last.itemId) : null,
  };
}

export class FeedQuery {
  constructor(
    private readonly posts: PostSource,
    private readonly assembler: PostAssembler,
    private readonly accounts: SocialAccounts,
  ) {}

  async execute(
    viewerId: string,
    scope: FeedScope,
    cursor?: string,
  ): Promise<Result<PostPage, DomainError>> {
    const refused = await ensureMember(this.accounts, viewerId);
    if (refused) return err(refused);
    return ok(await postPage(this.posts, this.assembler, scope, viewerId, cursor));
  }
}

export class TalentPostsQuery {
  constructor(
    private readonly posts: PostSource,
    private readonly assembler: PostAssembler,
    private readonly talents: SocialTalents,
  ) {}

  /** The same 404 as the profile for anyone not visible. */
  async execute(
    viewerId: string,
    handle: string,
    cursor?: string,
  ): Promise<Result<PostPage, DomainError>> {
    const talentId = await this.talents.visibleUserId(handle);
    if (!talentId) return err(SocialErrors.notFound());
    return ok(await postPage(this.posts, this.assembler, { talentId }, viewerId, cursor));
  }
}

async function socialOf(
  follows: FollowRepository,
  posts: PostSource,
  viewerId: string,
  talentId: string,
): Promise<TalentSocial> {
  const isSelf = viewerId === talentId;
  const [followers, following, total, followedByViewer] = await Promise.all([
    follows.countFollowers(talentId),
    follows.countFollowing(talentId),
    posts.countFor(talentId),
    isSelf ? Promise.resolve(false) : follows.isFollowing(viewerId, talentId),
  ]);
  return { followers, following, posts: total, followedByViewer, isSelf };
}

export class TalentSocialQuery {
  constructor(
    private readonly follows: FollowRepository,
    private readonly posts: PostSource,
    private readonly talents: SocialTalents,
  ) {}

  async execute(viewerId: string, handle: string): Promise<Result<TalentSocial, DomainError>> {
    const talentId = await this.talents.visibleUserId(handle);
    if (!talentId) return err(SocialErrors.notFound());
    return ok(await socialOf(this.follows, this.posts, viewerId, talentId));
  }
}

export class SuggestionsQuery {
  constructor(
    private readonly posts: PostSource,
    private readonly talents: SocialTalents,
    private readonly accounts: SocialAccounts,
  ) {}

  async execute(viewerId: string): Promise<Result<Suggestions, DomainError>> {
    const refused = await ensureMember(this.accounts, viewerId);
    if (refused) return err(refused);
    const ids = await this.posts.suggestions(viewerId, SUGGESTIONS_MAX);
    const cards = await Promise.all(ids.map((id) => this.talents.cardFor(id)));
    return ok({ items: cards.filter((card): card is TalentCard => card !== null) });
  }
}

export class FollowingQuery {
  constructor(
    private readonly follows: FollowRepository,
    private readonly talents: SocialTalents,
  ) {}

  /** Talent who are hidden now are left out, and come back if they return. */
  async execute(viewerId: string, cursor?: string): Promise<TalentCardPage> {
    const after = decodeCursor(cursor);
    const rows = await this.follows.followingPage(
      viewerId,
      after ? { followedAt: after.at, talentId: after.id } : null,
      FOLLOW_PAGE_SIZE + 1,
    );
    const page = rows.slice(0, FOLLOW_PAGE_SIZE);
    const cards = await Promise.all(page.map((row) => this.talents.cardFor(row.talentId)));
    const last = page.at(-1);
    return {
      items: cards.filter((card): card is TalentCard => card !== null),
      nextCursor:
        rows.length > FOLLOW_PAGE_SIZE && last
          ? encodeCursor(last.followedAt, last.talentId)
          : null,
    };
  }
}

export class FollowTalentHandler {
  constructor(
    private readonly follows: FollowRepository,
    private readonly posts: PostSource,
    private readonly accounts: SocialAccounts,
    private readonly talents: SocialTalents,
    private readonly agents: SocialAgents,
    private readonly events: EventRecorder,
    private readonly uow: UnitOfWork,
    private readonly rateLimiter: RateLimiter,
    private readonly clock: Clock,
  ) {}

  async execute(followerId: string, handle: string): Promise<Result<TalentSocial, DomainError>> {
    const refused = await ensureMember(this.accounts, followerId);
    if (refused) return err(refused);
    const talentId = await this.talents.visibleUserId(handle);
    if (!talentId) return err(SocialErrors.notFound());
    if (talentId === followerId) return err(SocialErrors.self());
    const limit = await this.rateLimiter.consume(
      `follow:${followerId}`,
      FOLLOW_LIMIT.perUser,
      FOLLOW_LIMIT.windowSeconds,
    );
    if (!limit.allowed) return err(SocialErrors.tooFast(limit.retryAfterSeconds));

    if (!(await this.follows.isFollowing(followerId, talentId))) {
      if ((await this.follows.countFollowing(followerId)) >= FOLLOWING_MAX) {
        return err(SocialErrors.full());
      }
      const follower = await this.introduce(followerId);
      const now = this.clock.now();
      // The follow and its event are saved together, so the talent is told exactly once.
      await this.uow.run(async () => {
        const created = await this.follows.add({ followerId, talentId, followedAt: now });
        if (created) {
          await this.events.record([
            {
              type: SocialEvents.TalentFollowed,
              aggregateId: talentId,
              occurredAt: now,
              payload: { followerId, ...follower },
            },
          ]);
        }
      });
    }
    return ok(await socialOf(this.follows, this.posts, followerId, talentId));
  }

  /** How the follower is named to the talent: their own page, or their agency. */
  private async introduce(
    followerId: string,
  ): Promise<{ followerName: string; followerHandle: string | null }> {
    const card = await this.talents.cardFor(followerId);
    if (card) return { followerName: card.displayName, followerHandle: card.handle };
    // A talent whose photo is still being checked has no page to open yet, but has a name.
    const name =
      (await this.talents.nameOf(followerId))?.displayName ??
      (await this.agents.summaryOf(followerId))?.agencyName;
    return { followerName: name ?? '', followerHandle: null };
  }
}

/** Works for talent who are hidden now, so anyone can always tidy who they follow. */
export class UnfollowTalentHandler {
  constructor(
    private readonly follows: FollowRepository,
    private readonly posts: PostSource,
    private readonly talents: SocialTalents,
  ) {}

  async execute(followerId: string, handle: string): Promise<Result<TalentSocial, DomainError>> {
    const talentId = await this.talents.userIdOf(handle);
    if (!talentId) return err(SocialErrors.notFound());
    await this.follows.remove(followerId, talentId);
    return ok(await socialOf(this.follows, this.posts, followerId, talentId));
  }
}

export class LikePostHandler {
  constructor(
    private readonly likes: LikeRepository,
    private readonly posts: PostSource,
    private readonly assembler: PostAssembler,
    private readonly accounts: SocialAccounts,
    private readonly rateLimiter: RateLimiter,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, itemId: string): Promise<Result<LikeState, DomainError>> {
    const refused = await ensureMember(this.accounts, userId);
    if (refused) return err(refused);
    const limit = await this.rateLimiter.consume(
      `like:${userId}`,
      LIKE_LIMIT.perUser,
      LIKE_LIMIT.windowSeconds,
    );
    if (!limit.allowed) return err(SocialErrors.tooFast(limit.retryAfterSeconds));
    // Only work that can be seen can be liked: the assembler applies the same rules as the feed.
    const row = await this.posts.find(itemId);
    const [post] = row ? await this.assembler.assemble([row], userId) : [];
    if (!post) return err(SocialErrors.postNotFound());
    await this.likes.add({ userId, itemId, likedAt: this.clock.now() });
    return ok({ liked: true, likes: (await this.likes.counts([itemId])).get(itemId) ?? 0 });
  }
}

export class UnlikePostHandler {
  constructor(private readonly likes: LikeRepository) {}

  async execute(userId: string, itemId: string): Promise<Result<LikeState, DomainError>> {
    await this.likes.remove(userId, itemId);
    return ok({ liked: false, likes: (await this.likes.counts([itemId])).get(itemId) ?? 0 });
  }
}

/** Who the person follows, for their data export (ADR-027). */
export class SocialExport {
  constructor(
    private readonly follows: FollowRepository,
    private readonly talents: SocialTalents,
  ) {}

  async forUser(userId: string): Promise<{ handle: string | null; followedAt: string }[]> {
    const rows = await this.follows.followingPage(userId, null, FOLLOWING_MAX);
    return Promise.all(
      rows.map(async (row) => ({
        handle: await this.talents.handleOf(row.talentId),
        followedAt: row.followedAt.toISOString(),
      })),
    );
  }
}
