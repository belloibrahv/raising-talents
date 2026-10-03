import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';
import {
  imageUrlsSchema,
  mediaKindSchema,
  mediaPurposeSchema,
  mediaStatusSchema,
  videoPlaybackSchema,
} from './media.js';
import { notificationSchema } from './notifications.js';
import { myPortfolioSchema } from './portfolio.js';
import { myAgentProfileSchema, myTalentProfileSchema } from './profiles.js';
import { accountStatusSchema, roleSchema } from './accounts.js';
import { myAgentVerificationSchema } from './verification.js';

/** Deleting an account needs the current password, so a borrowed phone cannot do it. */
export const requestDeletionSchema = z
  .object({ password: z.string().min(1).max(128) })
  .strict()
  .meta({ id: 'RequestAccountDeletion' });
export type RequestDeletion = z.infer<typeof requestDeletionSchema>;

/** Everything Raising Talents holds about the person, in one file (NDPR right of access). */
export const dataExportSchema = z
  .object({
    exportedAt: isoDateTimeSchema,
    account: z.object({
      email: z.string(),
      emailVerifiedAt: isoDateTimeSchema.nullable(),
      dateOfBirth: z.string(),
      countryCode: z.string(),
      role: roleSchema.nullable(),
      status: accountStatusSchema,
      deletionScheduledAt: isoDateTimeSchema.nullable(),
      createdAt: isoDateTimeSchema,
    }),
    talentProfile: myTalentProfileSchema.nullable(),
    agentProfile: myAgentProfileSchema.nullable(),
    agentVerification: myAgentVerificationSchema.nullable(),
    portfolio: myPortfolioSchema.nullable(),
    /** Notices in the app inbox, newest first. */
    notifications: z.array(notificationSchema),
    /** Agents only: who they saved and their private notes. Empty for everyone else. */
    shortlist: z.array(
      z.object({ handle: z.string().nullable(), note: z.string(), savedAt: isoDateTimeSchema }),
    ),
    media: z.array(
      z.object({
        id: z.string(),
        purpose: mediaPurposeSchema,
        kind: mediaKindSchema,
        status: mediaStatusSchema,
        urls: imageUrlsSchema.nullable(),
        video: videoPlaybackSchema.nullable(),
      }),
    ),
  })
  .meta({ id: 'DataExport' });
export type DataExport = z.infer<typeof dataExportSchema>;
