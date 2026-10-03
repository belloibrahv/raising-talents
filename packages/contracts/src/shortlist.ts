import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';
import { talentCardSchema } from './search.js';

/** Provisional (ADR-030): enough for a season of scouting, small enough to read. */
export const SHORTLIST_MAX = 500;
export const SHORTLIST_NOTE_MAX = 500;
export const SHORTLIST_PAGE_SIZE = 24;

/** Saving again keeps the date first saved and replaces the note. */
export const saveToShortlistSchema = z
  .object({ note: z.string().trim().max(SHORTLIST_NOTE_MAX).optional() })
  .strict()
  .meta({ id: 'SaveToShortlist' });
export type SaveToShortlist = z.input<typeof saveToShortlistSchema>;

/** A talent the agent saved, as they are now, with the agent's private note. */
export const shortlistEntrySchema = z
  .object({
    talent: talentCardSchema,
    note: z.string(),
    savedAt: isoDateTimeSchema,
    updatedAt: isoDateTimeSchema,
  })
  .meta({ id: 'ShortlistEntry' });
export type ShortlistEntry = z.infer<typeof shortlistEntrySchema>;

/**
 * Newest first. Talent who are not visible right now (suspended, or hiding while they
 * delete their account) are left out of the page but stay saved.
 */
export const shortlistPageSchema = z
  .object({
    items: z.array(shortlistEntrySchema),
    /** Every saved talent, visible or not, so the agent can see how close the limit is. */
    saved: z.number().int().nonnegative(),
    max: z.number().int().positive(),
    nextCursor: z.string().nullable(),
  })
  .meta({ id: 'ShortlistPage' });
export type ShortlistPage = z.infer<typeof shortlistPageSchema>;

export const shortlistQuerySchema = z.object({ cursor: z.string().max(200).optional() });
