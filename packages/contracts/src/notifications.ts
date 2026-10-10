import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { mediaKindSchema, mediaPurposeSchema } from './media.js';

export const NOTIFICATIONS_PAGE_SIZE = 20;

const common = {
  id: idSchema,
  createdAt: isoDateTimeSchema,
  read: z.boolean(),
};

/**
 * Something that happened on the person's behalf. The app writes the words from the kind,
 * so the copy can change, and be translated, without touching stored notices.
 */
export const notificationSchema = z
  .discriminatedUnion('kind', [
    z.object({
      ...common,
      kind: z.literal('media_approved'),
      mediaKind: mediaKindSchema,
      purpose: mediaPurposeSchema,
    }),
    z.object({
      ...common,
      kind: z.literal('media_rejected'),
      mediaKind: mediaKindSchema,
      purpose: mediaPurposeSchema,
      reason: z.string(),
    }),
    z.object({ ...common, kind: z.literal('agent_verified') }),
    z.object({ ...common, kind: z.literal('agent_declined'), reason: z.string() }),
    z.object({
      ...common,
      kind: z.literal('deletion_scheduled'),
      scheduledFor: isoDateTimeSchema,
    }),
    z.object({ ...common, kind: z.literal('account_reinstated') }),
    z.object({ ...common, kind: z.literal('password_changed') }),
    z.object({ ...common, kind: z.literal('email_changed') }),
    z.object({
      ...common,
      kind: z.literal('contact_requested'),
      conversationId: idSchema,
      agencyName: z.string(),
    }),
    z.object({
      ...common,
      kind: z.literal('contact_accepted'),
      conversationId: idSchema,
      talentName: z.string(),
    }),
    z.object({ ...common, kind: z.literal('contact_declined'), talentName: z.string() }),
    z.object({
      ...common,
      kind: z.literal('new_follower'),
      /** The follower's name: a talent's display name or an agent's agency. */
      followerName: z.string(),
      /** Set when the follower is a talent with a page to open. */
      followerHandle: z.string().nullable(),
    }),
  ])
  .meta({ id: 'Notification' });
export type Notification = z.infer<typeof notificationSchema>;
export type NotificationKind = Notification['kind'];

export const notificationPageSchema = z
  .object({
    items: z.array(notificationSchema),
    unread: z.number().int().nonnegative(),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'NotificationPage' });
export type NotificationPage = z.infer<typeof notificationPageSchema>;

export const unreadCountSchema = z
  .object({ unread: z.number().int().nonnegative() })
  .meta({ id: 'UnreadNotifications' });

export const notificationsQuerySchema = z.object({ cursor: z.string().max(200).optional() });
