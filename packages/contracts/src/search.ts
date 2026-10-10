import { z } from 'zod';
import { imageUrlsSchema } from './media.js';
import { genderSchema } from './profiles.js';
import { countryCodeSchema, namedRefSchema, slugSchema } from './taxonomy.js';

export const SEARCH_PAGE_SIZE = 24;
export const SEARCH_MAX_PAGE = 50;
export const SEARCH_MIN_AGE = 18;
export const SEARCH_MAX_AGE = 99;

/** Several values in one query parameter, comma separated: cities=ng-lagos,ng-abuja. */
const slugList = (max: number) =>
  z
    .string()
    .optional()
    .transform((value) =>
      value ? [...new Set(value.split(',').map((part) => part.trim()))].filter(Boolean) : [],
    )
    .pipe(z.array(slugSchema).max(max));

const age = z.coerce.number().int().min(SEARCH_MIN_AGE).max(SEARCH_MAX_AGE).optional();

/** Query string for /v1/search/talents. Unknown parameters are refused, so a typo is not silently ignored. */
export const searchTalentsQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    category: slugSchema.optional(),
    subcategories: slugList(5),
    country: z.string().trim().toUpperCase().pipe(countryCodeSchema).optional(),
    cities: slugList(10),
    skills: slugList(10),
    gender: genderSchema.optional(),
    ageMin: age,
    ageMax: age,
    page: z.coerce.number().int().min(1).max(SEARCH_MAX_PAGE).default(1),
  })
  .strict()
  .refine(
    (query) =>
      query.ageMin === undefined || query.ageMax === undefined || query.ageMin <= query.ageMax,
    {
      message: 'The lowest age must not be above the highest',
      path: ['ageMin'],
    },
  );
export type SearchTalentsQuery = z.output<typeof searchTalentsQuerySchema>;
export type SearchTalentsQueryInput = z.input<typeof searchTalentsQuerySchema>;

/** One result. The same facts as the public profile, never the date of birth. */
export const talentCardSchema = z
  .object({
    handle: z.string(),
    displayName: z.string(),
    category: namedRefSchema,
    subcategories: z.array(namedRefSchema),
    city: namedRefSchema.extend({ countryCode: z.string().length(2) }),
    ageYears: z.number().int().nullable(),
    verified: z.boolean(),
    avatarUrls: imageUrlsSchema.nullable(),
  })
  .meta({ id: 'TalentCard' });
export type TalentCard = z.infer<typeof talentCardSchema>;

const facetSchema = z.array(namedRefSchema.extend({ count: z.number().int().nonnegative() }));
const countryFacetSchema = z.array(
  z.object({ slug: countryCodeSchema, name: z.string(), count: z.number().int().nonnegative() }),
);

export const talentSearchResponseSchema = z
  .object({
    items: z.array(talentCardSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    perPage: z.number().int().positive(),
    hasMore: z.boolean(),
    /** Counts for the current search, to show next to each filter option. */
    facets: z.object({
      categories: facetSchema,
      subcategories: facetSchema,
      /** The slug is the country code. */
      countries: countryFacetSchema,
      cities: facetSchema,
    }),
  })
  .meta({ id: 'TalentSearchResponse' });
export type TalentSearchResponse = z.infer<typeof talentSearchResponseSchema>;
