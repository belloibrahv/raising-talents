import { z } from 'zod';
import { idSchema, isoDateTimeSchema } from './common.js';

/** Roles a person can choose. Moderator and admin are assigned, never chosen. */
export const selectableRoleSchema = z.enum(['talent', 'agent']);
export type SelectableRole = z.infer<typeof selectableRoleSchema>;

export const roleSchema = z.enum(['talent', 'agent', 'moderator', 'admin']);
export type Role = z.infer<typeof roleSchema>;

export const accountStatusSchema = z.enum([
  'onboarding',
  'active',
  'suspended',
  'banned',
  'pending_deletion',
]);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

export const meResponseSchema = z
  .object({
    id: idSchema,
    email: z.email(),
    emailVerified: z.boolean(),
    role: roleSchema.nullable(),
    roleLocked: z.boolean(),
    status: accountStatusSchema,
    countryCode: z.string().length(2).nullable(),
    /** When the account will be erased, if the owner asked to delete it. */
    deletionScheduledAt: isoDateTimeSchema.nullable(),
    createdAt: isoDateTimeSchema,
  })
  .meta({ id: 'Me' });
export type MeResponse = z.infer<typeof meResponseSchema>;

export const selectRoleRequestSchema = z
  .object({
    role: selectableRoleSchema,
  })
  .meta({ id: 'SelectRoleRequest' });
export type SelectRoleRequest = z.infer<typeof selectRoleRequestSchema>;
