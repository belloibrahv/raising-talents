import { z } from 'zod';
import { passwordSchema } from './auth.js';
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
