import { z } from 'zod';
import { idSchema, isoDateTimeSchema, webAddressSchema } from './common.js';
import { namedRefSchema } from './taxonomy.js';

export const VERIFICATION_NOTE_MAX = 500;

export const requestAgentVerificationSchema = z
  .object({
    /** A page that shows the agent works for the agency: its website team page, or its official social page. */
    evidenceUrl: webAddressSchema(300),
    note: z.string().trim().max(VERIFICATION_NOTE_MAX).optional(),
  })
  .strict()
  .meta({ id: 'RequestAgentVerification' });
export type RequestAgentVerification = z.input<typeof requestAgentVerificationSchema>;

export const agentVerificationStateSchema = z.enum([
  'not_requested',
  'pending',
  'verified',
  'declined',
]);

/** What the agent sees about their own verification. */
export const myAgentVerificationSchema = z
  .object({
    state: agentVerificationStateSchema,
    /** Present when the latest request was declined: the sentence for its reason. */
    declineReason: z.string().nullable(),
    submittedAt: isoDateTimeSchema.nullable(),
    /** False while a request is pending, once verified, or before the profile is complete. */
    canRequest: z.boolean(),
  })
  .meta({ id: 'MyAgentVerification' });
export type MyAgentVerification = z.infer<typeof myAgentVerificationSchema>;

export const verificationDeclineCategorySchema = z.enum([
  'agency_not_confirmed',
  'details_do_not_match',
  'evidence_unreachable',
  'other',
]);
export type VerificationDeclineCategory = z.infer<typeof verificationDeclineCategorySchema>;

/** One pending request, with everything a moderator needs to check it. Staff only. */
export const verificationForReviewSchema = z
  .object({
    id: idSchema,
    agentId: idSchema,
    email: z.string(),
    agencyName: z.string(),
    jobTitle: z.string(),
    city: namedRefSchema.nullable(),
    specializations: z.array(namedRefSchema),
    website: z.string().nullable(),
    evidenceUrl: z.string(),
    /** A CAC number from a request made before ADR-060; new requests have none. */
    registrationNumber: z.string().nullable(),
    note: z.string(),
    submittedAt: isoDateTimeSchema,
    /** Earlier requests that were declined, so a pattern is visible. */
    previouslyDeclined: z.number().int().nonnegative(),
  })
  .meta({ id: 'VerificationForReview' });
export type VerificationForReview = z.infer<typeof verificationForReviewSchema>;

export const verificationQueuePageSchema = z
  .object({ items: z.array(verificationForReviewSchema), nextCursor: z.string().nullable() })
  .meta({ id: 'VerificationQueuePage' });
export type VerificationQueuePage = z.infer<typeof verificationQueuePageSchema>;

export const verificationDecisionSchema = z
  .discriminatedUnion('decision', [
    z.object({ decision: z.literal('approve') }).strict(),
    z
      .object({ decision: z.literal('decline'), category: verificationDeclineCategorySchema })
      .strict(),
  ])
  .meta({ id: 'VerificationDecision' });
export type VerificationDecision = z.infer<typeof verificationDecisionSchema>;
