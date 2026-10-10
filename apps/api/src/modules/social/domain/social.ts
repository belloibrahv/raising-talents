import type { FeedScope, PortfolioItemKind } from '@rt/contracts';

export const SocialEvents = {
  /**
   * Someone started following a talent. The aggregate is the talent; the payload names the
   * follower (followerId, followerName, followerHandle) so the talent can be told.
   */
  TalentFollowed: 'social.TalentFollowed',
} as const;

export interface Follow {
  readonly followerId: string;
  readonly talentId: string;
  readonly followedAt: Date;
}

export interface FollowRepository {
  isFollowing(followerId: string, talentId: string): Promise<boolean>;
  /** True when this call created the follow; false when it was already there. */
  add(follow: Follow): Promise<boolean>;
  remove(followerId: string, talentId: string): Promise<void>;
  countFollowers(talentId: string): Promise<number>;
  countFollowing(followerId: string): Promise<number>;
  /** Most recent first. */
  followingPage(
    followerId: string,
    after: { followedAt: Date; talentId: string } | null,
    limit: number,
  ): Promise<Follow[]>;
}

export interface LikeRepository {
  /** Adding a like twice is not an error. */
  add(like: { userId: string; itemId: string; likedAt: Date }): Promise<void>;
  remove(userId: string, itemId: string): Promise<void>;
  /** Items with no likes are absent from the map. */
  counts(itemIds: readonly string[]): Promise<Map<string, number>>;
  /** Which of these items the person liked. */
  likedBy(userId: string, itemIds: readonly string[]): Promise<Set<string>>;
}

/** A portfolio item as the feed needs it, before names, files and likes are added. */
export interface PostRow {
  readonly itemId: string;
  readonly talentId: string;
  readonly mediaId: string;
  readonly kind: PortfolioItemKind;
  readonly caption: string;
  readonly postedAt: Date;
}

export interface PostPageRequest {
  /** Everyone, the talent the viewer follows, or one talent's own work. */
  readonly scope: FeedScope | { readonly talentId: string };
  readonly viewerId: string;
  readonly after: { postedAt: Date; itemId: string } | null;
  readonly limit: number;
}

/**
 * The feed's read side: portfolio items whose file is ready, from talent who are visible,
 * newest first. One query in production; the use cases check visibility again when they add
 * the names, so a row that slips through is dropped, never shown.
 */
export interface PostSource {
  page(request: PostPageRequest): Promise<PostRow[]>;
  find(itemId: string): Promise<PostRow | null>;
  countFor(talentId: string): Promise<number>;
  /** Visible talent the viewer does not follow, newest profiles first. Never the viewer. */
  suggestions(viewerId: string, limit: number): Promise<string[]>;
}
