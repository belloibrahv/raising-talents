import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import {
  audioPlaybackSchema,
  imageUrlsSchema,
  mediaStatusSchema,
  videoPlaybackSchema,
} from './media.js';

/** Provisional limits (ADR-020) until the client signs off on section 6 of the design. */
export const PORTFOLIO_MAX_ITEMS = 30;
export const PORTFOLIO_CAPTION_MAX = 300;
/** A post that is only words (ADR-057). */
export const POST_TEXT_MAX = 500;

/** Clients must skip kinds they do not know, so new kinds can ship without breaking old apps. */
export const portfolioItemKindSchema = z.enum(['image', 'video', 'audio', 'text']);
export type PortfolioItemKind = z.infer<typeof portfolioItemKindSchema>;

const captionSchema = z.string().trim().max(PORTFOLIO_CAPTION_MAX);

export const addPortfolioItemRequestSchema = z
  .object({
    mediaId: idSchema,
    caption: captionSchema.optional(),
  })
  .strict()
  .meta({ id: 'AddPortfolioItemRequest' });
export type AddPortfolioItemRequest = z.infer<typeof addPortfolioItemRequestSchema>;

/** A post with no file: the words are the post. */
export const addTextPostRequestSchema = z
  .object({ text: z.string().trim().min(1).max(POST_TEXT_MAX) })
  .strict()
  .meta({ id: 'AddTextPostRequest' });
export type AddTextPostRequest = z.infer<typeof addTextPostRequestSchema>;

/** A caption up to 300 characters; the words of a text post up to 500, and never empty. */
export const updatePortfolioItemRequestSchema = z
  .object({
    caption: z.string().trim().max(POST_TEXT_MAX),
  })
  .strict()
  .meta({ id: 'UpdatePortfolioItemRequest' });
export type UpdatePortfolioItemRequest = z.infer<typeof updatePortfolioItemRequestSchema>;

/** Every item id, in the new order. Sending a partial or outdated list is refused. */
export const reorderPortfolioRequestSchema = z
  .object({
    itemIds: z
      .array(idSchema)
      .max(PORTFOLIO_MAX_ITEMS)
      .refine((ids) => new Set(ids).size === ids.length, 'Each item can appear once'),
  })
  .strict()
  .meta({ id: 'ReorderPortfolioRequest' });
export type ReorderPortfolioRequest = z.infer<typeof reorderPortfolioRequestSchema>;

/** The owner sees every item with its media status, so a held or rejected file can be explained. */
export const myPortfolioItemSchema = z
  .object({
    id: idSchema,
    kind: portfolioItemKindSchema,
    /** Null for a text post, which has no file. */
    mediaId: idSchema.nullable(),
    /** Always ready for a text post. */
    mediaStatus: mediaStatusSchema,
    caption: z.string(),
    urls: imageUrlsSchema.nullable(),
    video: videoPlaybackSchema.nullable(),
    audio: audioPlaybackSchema.nullable(),
    rejectionReason: z.string().nullable(),
    createdAt: isoDateTimeSchema,
  })
  .meta({ id: 'MyPortfolioItem' });
export type MyPortfolioItem = z.infer<typeof myPortfolioItemSchema>;

export const myPortfolioSchema = z
  .object({
    items: z.array(myPortfolioItemSchema),
    maxItems: z.number().int().positive(),
    version: z.number().int().nonnegative(),
  })
  .meta({ id: 'MyPortfolio' });
export type MyPortfolio = z.infer<typeof myPortfolioSchema>;

/** What other users see: ready media only, in the talent's order. */
export const publicPortfolioItemSchema = z
  .discriminatedUnion('kind', [
    z.object({
      id: idSchema,
      kind: z.literal('image'),
      caption: z.string(),
      urls: imageUrlsSchema,
    }),
    z.object({
      id: idSchema,
      kind: z.literal('video'),
      caption: z.string(),
      video: videoPlaybackSchema,
    }),
    z.object({
      id: idSchema,
      kind: z.literal('audio'),
      caption: z.string(),
      audio: audioPlaybackSchema,
    }),
    /** The caption is the post. */
    z.object({ id: idSchema, kind: z.literal('text'), caption: z.string() }),
  ])
  .meta({ id: 'PublicPortfolioItem' });
export type PublicPortfolioItem = z.infer<typeof publicPortfolioItemSchema>;

export const publicPortfolioSchema = z
  .object({
    items: z.array(publicPortfolioItemSchema),
  })
  .meta({ id: 'PublicPortfolio' });
export type PublicPortfolio = z.infer<typeof publicPortfolioSchema>;

/**
 * A talent's shareable page, for anyone with the link (ADR-042). Only for talent who turned
 * the link on. Never shows age, gender or anything only agents may see.
 */
export const sharedTalentProfileSchema = z
  .object({
    handle: z.string(),
    displayName: z.string(),
    bio: z.string(),
    discipline: z.string(),
    category: z.string(),
    city: z.string(),
    skills: z.array(z.string()),
    verified: z.boolean(),
    avatarUrls: imageUrlsSchema.nullable(),
    portfolio: z.array(publicPortfolioItemSchema),
  })
  .meta({ id: 'SharedTalentProfile' });
export type SharedTalentProfile = z.infer<typeof sharedTalentProfileSchema>;
