import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { namedRefSchema, slugSchema } from './taxonomy.js';

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 30;
export const DISPLAY_NAME_MAX = 50;
export const BIO_MAX = 1000;
export const BIO_MIN_FOR_COMPLETE = 50;
export const MAX_SUBCATEGORIES = 5;
export const MAX_SKILLS = 15;
export const MAX_SPECIALIZATIONS = 5;

/** Lowercase letters, digits, dots and underscores, starting and ending with a letter or digit. */
export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(HANDLE_MIN)
      .max(HANDLE_MAX)
      .regex(/^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$/, 'Use letters, numbers, dots or underscores')
      .refine(
        (value) => !/[._]{2}/.test(value),
        'Dots and underscores cannot be next to each other',
      ),
  );

export const genderSchema = z.enum(['female', 'male', 'non_binary']);
export type Gender = z.infer<typeof genderSchema>;

/** What the talent still has to add before the profile can be shown to agents. */
export const talentMissingFieldSchema = z.enum([
  'displayName',
  'category',
  'subcategories',
  'city',
  'bio',
  'avatar',
]);
export type TalentMissingField = z.infer<typeof talentMissingFieldSchema>;

export const updateTalentProfileRequestSchema = z
  .object({
    handle: handleSchema.optional(),
    displayName: z.string().trim().min(2).max(DISPLAY_NAME_MAX).optional(),
    bio: z.string().trim().max(BIO_MAX).optional(),
    categorySlug: slugSchema.optional(),
    subcategorySlugs: z.array(slugSchema).max(MAX_SUBCATEGORIES).optional(),
    skillSlugs: z.array(slugSchema).max(MAX_SKILLS).optional(),
    citySlug: slugSchema.optional(),
    gender: genderSchema.nullable().optional(),
    genderSearchable: z.boolean().optional(),
  })
  .strict()
  .meta({ id: 'UpdateTalentProfileRequest' });
export type UpdateTalentProfileRequest = z.infer<typeof updateTalentProfileRequestSchema>;

/** The owner's view: everything, including what is still missing. */
export const myTalentProfileSchema = z
  .object({
    userId: idSchema,
    handle: z.string(),
    displayName: z.string().nullable(),
    bio: z.string(),
    category: namedRefSchema.nullable(),
    subcategories: z.array(namedRefSchema),
    skills: z.array(namedRefSchema),
    city: namedRefSchema.extend({ countryCode: z.string().length(2) }).nullable(),
    gender: genderSchema.nullable(),
    genderSearchable: z.boolean(),
    avatarMediaId: idSchema.nullable(),
    isComplete: z.boolean(),
    missing: z.array(talentMissingFieldSchema),
    version: z.number().int().positive(),
    updatedAt: isoDateTimeSchema,
  })
  .meta({ id: 'MyTalentProfile' });
export type MyTalentProfile = z.infer<typeof myTalentProfileSchema>;

/** What agents and other users see. Age in years only, never the date of birth. */
export const publicTalentProfileSchema = z
  .object({
    handle: z.string(),
    displayName: z.string(),
    bio: z.string(),
    category: namedRefSchema,
    subcategories: z.array(namedRefSchema),
    skills: z.array(namedRefSchema),
    city: namedRefSchema.extend({ countryCode: z.string().length(2) }),
    ageYears: z.number().int().nullable(),
    gender: genderSchema.nullable(),
    verified: z.boolean(),
    avatarMediaId: idSchema.nullable(),
  })
  .meta({ id: 'PublicTalentProfile' });
export type PublicTalentProfile = z.infer<typeof publicTalentProfileSchema>;

export const agentMissingFieldSchema = z.enum([
  'agencyName',
  'jobTitle',
  'specializations',
  'city',
]);
export type AgentMissingField = z.infer<typeof agentMissingFieldSchema>;

export const updateAgentProfileRequestSchema = z
  .object({
    agencyName: z.string().trim().min(2).max(100).optional(),
    jobTitle: z.string().trim().min(2).max(60).optional(),
    specializationSlugs: z.array(slugSchema).max(MAX_SPECIALIZATIONS).optional(),
    citySlug: slugSchema.optional(),
    website: z
      .url({ protocol: /^https$/, error: 'Use a full https:// address' })
      .max(200)
      .nullable()
      .optional(),
  })
  .strict()
  .meta({ id: 'UpdateAgentProfileRequest' });
export type UpdateAgentProfileRequest = z.infer<typeof updateAgentProfileRequestSchema>;

export const myAgentProfileSchema = z
  .object({
    userId: idSchema,
    agencyName: z.string().nullable(),
    jobTitle: z.string().nullable(),
    specializations: z.array(namedRefSchema),
    city: namedRefSchema.extend({ countryCode: z.string().length(2) }).nullable(),
    website: z.string().nullable(),
    verified: z.boolean(),
    isComplete: z.boolean(),
    missing: z.array(agentMissingFieldSchema),
    version: z.number().int().positive(),
    updatedAt: isoDateTimeSchema,
  })
  .meta({ id: 'MyAgentProfile' });
export type MyAgentProfile = z.infer<typeof myAgentProfileSchema>;
