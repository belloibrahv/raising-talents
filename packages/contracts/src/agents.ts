import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';
import { imageUrlsSchema } from './media.js';
import { rosterStatusSchema } from './profiles.js';
import { countryCodeSchema, namedRefSchema, slugSchema } from './taxonomy.js';

export const AGENT_PAGE_SIZE = 24;
/** How many agents one person can keep saved. */
export const SAVED_AGENTS_MAX = 200;

/**
 * An agent as other members see them in a list. Only verified agencies with a finished
 * profile and an account in good standing are ever shown (ADR-049).
 */
export const agentCardSchema = z
  .object({
    /** The agent's account id: agents have no handle. */
    id: idSchema,
    agencyName: z.string(),
    jobTitle: z.string(),
    city: namedRefSchema.extend({ countryCode: z.string().length(2) }),
    specializations: z.array(namedRefSchema),
    verified: z.boolean(),
    /** Whether they are taking on new talent. Null when they have not said. */
    rosterStatus: rosterStatusSchema.nullable(),
    avatarUrls: imageUrlsSchema.nullable(),
    /** Whether the viewer saved them. */
    saved: z.boolean(),
  })
  .meta({ id: 'AgentCard' });
export type AgentCard = z.infer<typeof agentCardSchema>;

/** The agent's own page: the card, plus what they wrote about themselves. */
export const publicAgentProfileSchema = agentCardSchema
  .extend({
    bio: z.string(),
    website: z.string().nullable(),
    avatarMediaId: idSchema.nullable(),
    memberSince: isoDateTimeSchema,
    /** True on your own page. */
    isSelf: z.boolean(),
  })
  .meta({ id: 'PublicAgentProfile' });
export type PublicAgentProfile = z.infer<typeof publicAgentProfileSchema>;

export const searchAgentsQuerySchema = z
  .object({
    /** Matches the agency name, the job title and the bio. */
    q: z.string().trim().max(80).optional(),
    /** A category the agent works in. */
    category: slugSchema.optional(),
    country: countryCodeSchema.optional(),
    city: slugSchema.optional(),
    /** Only agents who are open for submissions. */
    open: z.enum(['true', 'false']).optional(),
    cursor: z.string().max(200).optional(),
  })
  .strict();
export type SearchAgentsQuery = z.infer<typeof searchAgentsQuerySchema>;

export const agentPageSchema = z
  .object({ items: z.array(agentCardSchema), nextCursor: z.string().nullable() })
  .meta({ id: 'AgentPage' });
export type AgentPage = z.infer<typeof agentPageSchema>;

export const savedAgentStateSchema = z
  .object({ saved: z.boolean() })
  .meta({ id: 'SavedAgentState' });
export type SavedAgentState = z.infer<typeof savedAgentStateSchema>;
