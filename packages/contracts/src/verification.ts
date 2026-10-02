import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { namedRefSchema } from './taxonomy.js';

export const VERIFICATION_NOTE_MAX = 500;

/**
 * A CAC number as Nigerian companies write it: RC (companies), BN (business names) or IT
 * (incorporated trustees), then digits. Normalised to "RC 123456". Provisional (ADR-026).
 */
export const cacNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^(RC|BN|IT)\s?-?\d{4,8}$/, 'Use the CAC number as printed, for example RC 123456')
  // overwrite keeps the type a string, so the OpenAPI document can still describe it.
  .overwrite((value) => value.replace(/^(RC|BN|IT)\s?-?/, '$1 '));

export const requestAgentVerificationSchema = z
  .object({
    /** A page that shows the agent works for the agency: its website team page, or its official social page. */
    evidenceUrl: z.url({ protocol: /^https$/, error: 'Use a full https:// address' }).max(300),
    registrationNumber: cacNumberSchema.optional(),
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
