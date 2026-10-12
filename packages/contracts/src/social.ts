import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { audioPlaybackSchema, imageUrlsSchema, videoPlaybackSchema } from './media.js';
import { talentCardSchema } from './search.js';

export const FEED_PAGE_SIZE = 12;
export const FOLLOW_PAGE_SIZE = 24;
/** Enough for anyone following by hand; stops a script following everyone. */
export const FOLLOWING_MAX = 5000;
export const SUGGESTIONS_MAX = 12;
export const COMMENT_MAX = 500;
export const COMMENTS_PAGE_SIZE = 20;

/** following: talent the viewer follows. discover: everyone, newest first. */
export const feedScopeSchema = z.enum(['following', 'discover']);
export type FeedScope = z.infer<typeof feedScopeSchema>;

export const feedQuerySchema = z
  .object({
    scope: feedScopeSchema.default('discover'),
    cursor: z.string().max(200).optional(),
  })
  .strict();
export type FeedQuery = z.output<typeof feedQuerySchema>;

export const cursorQuerySchema = z.object({ cursor: z.string().max(200).optional() }).strict();

const postBase = {
  /** The portfolio item's id. */
  id: idSchema,
  /** The photo, video or recording, which is what a moderator removes. Null for a text post. */
  mediaId: idSchema.nullable(),
  caption: z.string(),
  postedAt: isoDateTimeSchema,
  talent: talentCardSchema,
  likes: z.number().int().nonnegative(),
  /** Whether the viewer liked it. */
  liked: z.boolean(),
  comments: z.number().int().nonnegative(),
};

/** A piece of work as it appears in a feed: the portfolio item, who posted it, and its likes. */
export const postSchema = z
  .discriminatedUnion('kind', [
    z.object({ ...postBase, kind: z.literal('image'), urls: imageUrlsSchema }),
    z.object({ ...postBase, kind: z.literal('video'), video: videoPlaybackSchema }),
    z.object({ ...postBase, kind: z.literal('audio'), audio: audioPlaybackSchema }),
    /** Only words: the caption is the post (ADR-057). */
    z.object({ ...postBase, kind: z.literal('text') }),
  ])
  .meta({ id: 'Post' });
export type Post = z.infer<typeof postSchema>;

export const postPageSchema = z
  .object({
    items: z.array(postSchema),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'PostPage' });
export type PostPage = z.infer<typeof postPageSchema>;

export const likeStateSchema = z
  .object({ liked: z.boolean(), likes: z.number().int().nonnegative() })
  .meta({ id: 'LikeState' });
export type LikeState = z.infer<typeof likeStateSchema>;

/** A talent's numbers, and where the viewer stands with them. */
export const talentSocialSchema = z
  .object({
    followers: z.number().int().nonnegative(),
    /** How many talent this person follows. */
    following: z.number().int().nonnegative(),
    posts: z.number().int().nonnegative(),
    /** Whether the viewer follows them. Always false on your own profile. */
    followedByViewer: z.boolean(),
    isSelf: z.boolean(),
  })
  .meta({ id: 'TalentSocial' });
export type TalentSocial = z.infer<typeof talentSocialSchema>;

export const talentCardPageSchema = z
  .object({
    items: z.array(talentCardSchema),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'TalentCardPage' });
export type TalentCardPage = z.infer<typeof talentCardPageSchema>;

/** Talent the viewer does not follow yet, newest first. */
export const suggestionsSchema = z
  .object({ items: z.array(talentCardSchema) })
  .meta({ id: 'Suggestions' });
export type Suggestions = z.infer<typeof suggestionsSchema>;

/** Who wrote a comment: a talent with their page, or an agent with their agency. */
export const commentAuthorSchema = z
  .object({
    name: z.string(),
    /** Set when the author is a talent whose page can be opened. */
    handle: z.string().nullable(),
    /** Set when the author is an agent talent can find (ADR-049). */
    agentId: idSchema.nullable(),
    avatarUrls: imageUrlsSchema.nullable(),
    verified: z.boolean(),
  })
  .meta({ id: 'CommentAuthor' });
export type CommentAuthor = z.infer<typeof commentAuthorSchema>;

export const commentSchema = z
  .object({
    id: idSchema,
    body: z.string(),
    postedAt: isoDateTimeSchema,
    author: commentAuthorSchema,
    /** The viewer wrote it. */
    mine: z.boolean(),
    /** The viewer wrote it, owns the post, or is a moderator. */
    canDelete: z.boolean(),
  })
  .meta({ id: 'Comment' });
export type Comment = z.infer<typeof commentSchema>;

/** Newest first. */
export const commentPageSchema = z
  .object({
    items: z.array(commentSchema),
    nextCursor: z.string().nullable(),
    /** Every comment on the post, not only this page. */
    total: z.number().int().nonnegative(),
  })
  .meta({ id: 'CommentPage' });
export type CommentPage = z.infer<typeof commentPageSchema>;

export const createCommentSchema = z
  .object({ body: z.string().trim().min(1).max(COMMENT_MAX) })
  .strict()
  .meta({ id: 'CreateComment' });
export type CreateComment = z.input<typeof createCommentSchema>;
