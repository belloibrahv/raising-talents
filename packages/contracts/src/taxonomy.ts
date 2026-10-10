import { z } from 'zod';

/** Taxonomy keys are slugs: stable across environments and readable in payloads. */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use a lowercase slug')
  .max(64);

const namedSchema = z.object({ slug: slugSchema, name: z.string() });

/** ISO 3166-1 alpha-2, upper case: GB, NG, US. */
export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/, 'Use a two-letter country code');

export const countrySchema = z
  .object({
    code: countryCodeSchema,
    name: z.string(),
    /** Other names people type for it: UK and England for the United Kingdom. */
    searchTerms: z.array(z.string()),
  })
  .meta({ id: 'Country' });
export type Country = z.infer<typeof countrySchema>;

export const taxonomyResponseSchema = z
  .object({
    categories: z.array(
      namedSchema.extend({
        subcategories: z.array(namedSchema),
      }),
    ),
    skills: z.array(namedSchema.extend({ categorySlug: slugSchema.nullable() })),
    /** Every country with cities to pick, by name. Cities load per country. */
    countries: z.array(countrySchema),
  })
  .meta({ id: 'Taxonomy' });
export type TaxonomyResponse = z.infer<typeof taxonomyResponseSchema>;

export const cityOptionSchema = namedSchema
  .extend({
    /** State, province or nation, to tell namesakes apart. Null when GeoNames has none. */
    region: z.string().nullable(),
  })
  .meta({ id: 'CityOption' });
export type CityOption = z.infer<typeof cityOptionSchema>;

/** A country's cities, largest first. Talent in a smaller town pick the nearest. */
export const countryCitiesResponseSchema = z
  .object({ items: z.array(cityOptionSchema) })
  .meta({ id: 'CountryCities' });
export type CountryCitiesResponse = z.infer<typeof countryCitiesResponseSchema>;

export const namedRefSchema = namedSchema.meta({ id: 'NamedRef' });
export type NamedRef = z.infer<typeof namedRefSchema>;
