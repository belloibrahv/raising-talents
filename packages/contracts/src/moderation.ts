import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import {
  imageUrlsSchema,
  mediaKindSchema,
  mediaPurposeSchema,
  videoPlaybackSchema,
} from './media.js';

export const MODERATION_PAGE_SIZE = 20;

/** The categories a moderator can reject for. Each has a fixed message the owner reads. */
export const rejectionCategorySchema = z.enum(['sexual', 'violence', 'hate', 'other']);
export type RejectionCategory = z.infer<typeof rejectionCategorySchema>;

export const moderationQueueQuerySchema = z
  .object({
    /** From the previous page's nextCursor. */
    cursor: z.string().max(200).optional(),
  })
  .strict();

/** One held item, with what the scanner saw. Only moderators and admins see this. */
export const heldMediaSchema = z
  .object({
    id: idSchema,
    ownerId: idSchema,
    purpose: mediaPurposeSchema,
    kind: mediaKindSchema,
    labels: z.array(
      z.object({ name: z.string(), parentName: z.string().nullable(), confidence: z.number() }),
    ),
    /** The processed image, never the original upload. */
    urls: imageUrlsSchema.nullable(),
    video: videoPlaybackSchema.nullable(),
    heldAt: isoDateTimeSchema,
  })
  .meta({ id: 'HeldMedia' });
export type HeldMedia = z.infer<typeof heldMediaSchema>;

export const heldMediaPageSchema = z
  .object({
    items: z.array(heldMediaSchema),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'HeldMediaPage' });
export type HeldMediaPage = z.infer<typeof heldMediaPageSchema>;

export const moderationDecisionSchema = z
  .discriminatedUnion('decision', [
    z.object({ decision: z.literal('approve') }).strict(),
    z.object({ decision: z.literal('reject'), category: rejectionCategorySchema }).strict(),
  ])
  .meta({ id: 'ModerationDecision' });
export type ModerationDecision = z.infer<typeof moderationDecisionSchema>;
