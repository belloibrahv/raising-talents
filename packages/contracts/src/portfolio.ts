import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { imageUrlsSchema, mediaStatusSchema } from './media.js';

/** Provisional limits (ADR-020) until the client signs off on section 6 of the design. */
export const PORTFOLIO_MAX_ITEMS = 30;
export const PORTFOLIO_CAPTION_MAX = 300;

/** Video joins this list with the Mux pipeline. Clients must ignore kinds they do not know. */
export const portfolioItemKindSchema = z.enum(['image']);
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

export const updatePortfolioItemRequestSchema = z
  .object({
    caption: captionSchema,
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
    mediaId: idSchema,
    mediaStatus: mediaStatusSchema,
    caption: z.string(),
    urls: imageUrlsSchema.nullable(),
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
  .object({
    id: idSchema,
    kind: portfolioItemKindSchema,
    caption: z.string(),
    urls: imageUrlsSchema,
  })
  .meta({ id: 'PublicPortfolioItem' });
export type PublicPortfolioItem = z.infer<typeof publicPortfolioItemSchema>;

export const publicPortfolioSchema = z
  .object({
    items: z.array(publicPortfolioItemSchema),
  })
  .meta({ id: 'PublicPortfolio' });
export type PublicPortfolio = z.infer<typeof publicPortfolioSchema>;
