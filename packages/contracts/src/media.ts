import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';

/** Images up to 15 MB (design section 6.4). The app resizes to 2048 px before upload, so real files are far smaller. */
export const IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export const UPLOAD_INTENT_TTL_SECONDS = 600;

export const mediaPurposeSchema = z.enum(['avatar', 'portfolio']);
export type MediaPurpose = z.infer<typeof mediaPurposeSchema>;

export const mediaStatusSchema = z.enum([
  'awaiting_upload',
  'processing',
  'scanning',
  'ready',
  'held_for_review',
  'rejected',
  'failed',
  'deleted',
]);
export type MediaStatus = z.infer<typeof mediaStatusSchema>;

export const createUploadIntentRequestSchema = z
  .object({
    purpose: mediaPurposeSchema,
    contentType: z.enum(IMAGE_CONTENT_TYPES),
    bytes: z.number().int().positive(),
  })
  .strict()
  .meta({ id: 'CreateUploadIntentRequest' });
export type CreateUploadIntentRequest = z.infer<typeof createUploadIntentRequestSchema>;

/** A browser-style POST upload: send every field, then the file as the last form field named "file". */
export const uploadIntentResponseSchema = z
  .object({
    mediaId: idSchema,
    upload: z.object({
      url: z.url(),
      fields: z.record(z.string(), z.string()),
    }),
    expiresAt: isoDateTimeSchema,
  })
  .meta({ id: 'UploadIntent' });
export type UploadIntentResponse = z.infer<typeof uploadIntentResponseSchema>;

export const imageUrlsSchema = z
  .object({
    small: z.url(),
    medium: z.url(),
    large: z.url(),
  })
  .meta({ id: 'ImageUrls' });
export type ImageUrls = z.infer<typeof imageUrlsSchema>;

/** The owner sees every state and the reason for a rejection. Others only ever see ready media. */
export const mediaAssetSchema = z
  .object({
    id: idSchema,
    purpose: mediaPurposeSchema,
    status: mediaStatusSchema,
    urls: imageUrlsSchema.nullable(),
    rejectionReason: z.string().nullable(),
    createdAt: isoDateTimeSchema,
  })
  .meta({ id: 'MediaAsset' });
export type MediaAsset = z.infer<typeof mediaAssetSchema>;
