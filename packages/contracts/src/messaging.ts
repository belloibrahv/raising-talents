import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { imageUrlsSchema } from './media.js';

/** Provisional (ADR-038): long enough to say who you are and why, short enough to read. */
export const CONTACT_MESSAGE_MIN = 20;
export const CONTACT_MESSAGE_MAX = 1000;
export const MESSAGE_MAX = 2000;
export const CONVERSATIONS_PAGE_SIZE = 20;
export const MESSAGES_PAGE_SIZE = 30;
/** After a talent declines, the same agent waits this long before asking again. */
export const CONTACT_DECLINE_COOLDOWN_DAYS = 30;

/**
 * The client makes this id once per message and sends it again on every retry, so a send
 * that timed out never posts twice (ADR-009).
 */
const clientMessageIdSchema = z.uuid();

export const requestContactSchema = z
  .object({
    message: z.string().trim().min(CONTACT_MESSAGE_MIN).max(CONTACT_MESSAGE_MAX),
    clientMessageId: clientMessageIdSchema,
  })
  .strict()
  .meta({ id: 'RequestContact' });
export type RequestContact = z.input<typeof requestContactSchema>;

export const sendMessageSchema = z
  .object({
    body: z.string().trim().min(1).max(MESSAGE_MAX),
    clientMessageId: clientMessageIdSchema,
  })
  .strict()
  .meta({ id: 'SendMessage' });
export type SendMessage = z.input<typeof sendMessageSchema>;

export const contactResponseSchema = z
  .object({ decision: z.enum(['accept', 'decline']) })
  .strict()
  .meta({ id: 'ContactResponse' });
export type ContactResponse = z.infer<typeof contactResponseSchema>;

/**
 * requested: the agent asked and the talent has not answered. accepted: chat is open.
 * declined: the talent said no. withdrawn: the agent took the request back.
 */
export const conversationStatusSchema = z.enum(['requested', 'accepted', 'declined', 'withdrawn']);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

/** The other person, as the viewer may see them. */
export const counterpartSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('talent'),
      handle: z.string(),
      displayName: z.string(),
      avatarUrls: imageUrlsSchema.nullable(),
      /** False when the profile is hidden now (suspended, or being deleted). */
      available: z.boolean(),
    }),
    z.object({
      kind: z.literal('agent'),
      agencyName: z.string(),
      jobTitle: z.string(),
      city: z.string().nullable(),
      verified: z.boolean(),
    }),
  ])
  .meta({ id: 'Counterpart' });
export type Counterpart = z.infer<typeof counterpartSchema>;

export const messageSchema = z
  .object({
    id: idSchema,
    /** True when the viewer wrote it. */
    mine: z.boolean(),
    body: z.string(),
    sentAt: isoDateTimeSchema,
  })
  .meta({ id: 'Message' });
export type Message = z.infer<typeof messageSchema>;

export const conversationSummarySchema = z
  .object({
    id: idSchema,
    status: conversationStatusSchema,
    counterpart: counterpartSchema,
    lastMessage: messageSchema.nullable(),
    unread: z.number().int().nonnegative(),
    /** The viewer may send a message now. */
    canSend: z.boolean(),
    /** The viewer is the talent and has not answered the request yet. */
    awaitingMyAnswer: z.boolean(),
    requestedAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .meta({ id: 'ConversationSummary' });
export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

/** Newest activity first. */
export const conversationPageSchema = z
  .object({ items: z.array(conversationSummarySchema), nextCursor: z.string().nullable() })
  .meta({ id: 'ConversationPage' });
export type ConversationPage = z.infer<typeof conversationPageSchema>;

/** Newest first; ask with the cursor for older ones. */
export const messagePageSchema = z
  .object({ items: z.array(messageSchema), nextCursor: z.string().nullable() })
  .meta({ id: 'MessagePage' });
export type MessagePage = z.infer<typeof messagePageSchema>;

/** For the Messages tab badge: requests waiting for an answer plus chats with unread messages. */
export const messagingUnreadSchema = z
  .object({ unread: z.number().int().nonnegative() })
  .meta({ id: 'MessagingUnread' });
export type MessagingUnread = z.infer<typeof messagingUnreadSchema>;

export const conversationsQuerySchema = z.object({ cursor: z.string().max(200).optional() });
export const messagesQuerySchema = z.object({ cursor: z.string().max(200).optional() });
