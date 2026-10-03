import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { accountStatusSchema, roleSchema } from './accounts.js';
import { handleSchema } from './profiles.js';

export const REPORT_NOTE_MAX = 500;

/** Why someone reports a profile. The same list is the reason a moderator gives for acting. */
export const reportCategorySchema = z.enum([
  'fake_or_impersonation',
  'inappropriate_content',
  'scam_or_harassment',
  'underage',
  'other',
]);
export type ReportCategory = z.infer<typeof reportCategorySchema>;

/**
 * What is reported: a talent's public profile, or the other person in a conversation the
 * reporter is part of (ADR-039). Agents have no public page, so a conversation is how they
 * are reported.
 */
export const reportSubjectSchema = z
  .discriminatedUnion('kind', [
    z.object({ kind: z.literal('talent'), handle: handleSchema }),
    z.object({ kind: z.literal('conversation'), conversationId: idSchema }),
  ])
  .meta({ id: 'ReportSubject' });

/** How many of the reported person's latest messages a conversation report keeps. */
export const REPORT_EVIDENCE_MAX = 10;

export const createReportSchema = z
  .object({
    subject: reportSubjectSchema,
    category: reportCategorySchema,
    note: z.string().trim().max(REPORT_NOTE_MAX).optional(),
  })
  .strict()
  .meta({ id: 'CreateReport' });
export type CreateReport = z.input<typeof createReportSchema>;

/** One reported account with all of its open reports. Staff only. */
export const reportedAccountSchema = z
  .object({
    accountId: idSchema,
    role: roleSchema.nullable(),
    status: accountStatusSchema,
    /** Present while the account has a complete talent profile. */
    talent: z.object({ handle: z.string(), displayName: z.string() }).nullable(),
    /** Present when the account is an agent with an agency profile. */
    agent: z.object({ agencyName: z.string(), verified: z.boolean() }).nullable(),
    /**
     * From the newest conversation report: the reported person's own latest messages in that
     * conversation, oldest first. Empty for profile reports.
     */
    evidence: z.array(z.object({ body: z.string(), sentAt: isoDateTimeSchema })),
    openReports: z.number().int().positive(),
    categories: z.array(
      z.object({ category: reportCategorySchema, count: z.number().int().positive() }),
    ),
    /** The latest notes reporters wrote, newest first. Reporters stay anonymous. */
    notes: z.array(z.object({ note: z.string(), reportedAt: isoDateTimeSchema })),
    firstReportedAt: isoDateTimeSchema,
    /** Earlier suspensions and bans, so a pattern is visible. */
    previousActions: z.number().int().nonnegative(),
  })
  .meta({ id: 'ReportedAccount' });
export type ReportedAccount = z.infer<typeof reportedAccountSchema>;

export const reportQueuePageSchema = z
  .object({ items: z.array(reportedAccountSchema), nextCursor: z.string().nullable() })
  .meta({ id: 'ReportQueuePage' });
export type ReportQueuePage = z.infer<typeof reportQueuePageSchema>;

/** Closes every open report on the account. Suspending and banning also sign them out. */
export const reportDecisionSchema = z
  .discriminatedUnion('decision', [
    z.object({ decision: z.literal('dismiss') }).strict(),
    z.object({ decision: z.literal('suspend'), reason: reportCategorySchema }).strict(),
    z.object({ decision: z.literal('ban'), reason: reportCategorySchema }).strict(),
  ])
  .meta({ id: 'ReportDecision' });
export type ReportDecision = z.infer<typeof reportDecisionSchema>;
