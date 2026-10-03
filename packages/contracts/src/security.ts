import { z } from 'zod';
import { emailSchema, passwordSchema, VERIFICATION_CODE_LENGTH } from './auth.js';
import { idSchema, isoDateTimeSchema } from './common.js';

/** Changing the password needs the current one; other devices are signed out afterwards. */
export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
  .strict()
  .meta({ id: 'ChangePassword' });
export type ChangePassword = z.input<typeof changePasswordSchema>;

/** One device the person is signed in on. */
export const signedInDeviceSchema = z
  .object({
    id: idSchema,
    /** "Chrome on Android", or null when the browser did not say. */
    device: z.string().nullable(),
    signedInAt: isoDateTimeSchema,
    lastActiveAt: isoDateTimeSchema,
    /** The device making this request. */
    current: z.boolean(),
  })
  .meta({ id: 'SignedInDevice' });
export type SignedInDevice = z.infer<typeof signedInDeviceSchema>;

export const signedInDevicesSchema = z
  .object({ items: z.array(signedInDeviceSchema) })
  .meta({ id: 'SignedInDevices' });
export type SignedInDevices = z.infer<typeof signedInDevicesSchema>;

const codeSchema = z
  .string()
  .regex(new RegExp(`^\\d{${String(VERIFICATION_CODE_LENGTH)}}$`), 'Enter the 6-digit code');

/** Moving the account to a new address needs the password; the new address gets a code. */
export const requestEmailChangeSchema = z
  .object({ newEmail: emailSchema, password: z.string().min(1).max(128) })
  .strict()
  .meta({ id: 'RequestEmailChange' });
export type RequestEmailChange = z.input<typeof requestEmailChangeSchema>;

export const confirmEmailChangeSchema = z
  .object({ code: codeSchema })
  .strict()
  .meta({ id: 'ConfirmEmailChange' });
export type ConfirmEmailChange = z.input<typeof confirmEmailChangeSchema>;

/** A change waiting for its code, so a reload can return to the code screen. */
export const pendingEmailChangeSchema = z
  .object({ newEmail: z.string(), requestedAt: isoDateTimeSchema })
  .meta({ id: 'PendingEmailChange' });
export type PendingEmailChange = z.infer<typeof pendingEmailChangeSchema>;
