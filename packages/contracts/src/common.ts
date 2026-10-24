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

/** A web address as people type it: "www.agency.com" or "agency.com/team" gets https:// in front. */
export function withHttps(raw: string): string {
  const value = raw.trim();
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

/** A secure web page with a real domain. Typing the https:// is optional; http:// is refused. */
export const webAddressSchema = (max: number) =>
  z
    .string()
    .trim()
    .regex(/^\S+$/, 'A web address has no spaces')
    .overwrite(withHttps)
    .pipe(
      z
        .url({
          protocol: /^https$/,
          hostname: z.regexes.domain,
          error: 'Use a web address such as www.agency.com',
        })
        .max(max),
    );
