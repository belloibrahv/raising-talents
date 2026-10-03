import { z } from 'zod';

/** Taxonomy keys are slugs: stable across environments and readable in payloads. */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase slug')
  .max(64);

const namedSchema = z.object({ slug: slugSchema, name: z.string() });

export const taxonomyResponseSchema = z
  .object({
    categories: z.array(
      namedSchema.extend({
        subcategories: z.array(namedSchema),
      }),
    ),
    skills: z.array(namedSchema.extend({ categorySlug: slugSchema.nullable() })),
    cities: z.array(namedSchema.extend({ countryCode: z.string().length(2) })),
  })
  .meta({ id: 'Taxonomy' });
export type TaxonomyResponse = z.infer<typeof taxonomyResponseSchema>;

export const namedRefSchema = namedSchema.meta({ id: 'NamedRef' });
export type NamedRef = z.infer<typeof namedRefSchema>;
