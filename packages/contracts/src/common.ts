import { z } from 'zod';

export const idSchema = z.uuid();

/** Calendar date without time, for example 2001-04-17. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

export const isoDateTimeSchema = z.iso.datetime({ offset: true });

/** A stable id the app creates once per install and sends with auth requests. */
export const deviceIdSchema = z.uuid();

export const cursorPageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).optional(),
});

export type CursorPageQuery = z.infer<typeof cursorPageQuerySchema>;

export function cursorPageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    nextCursor: z.string().nullable(),
  });
}
