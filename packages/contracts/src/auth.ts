import { z } from 'zod';
import { deviceIdSchema, isoDateSchema, isoDateTimeSchema } from './common.js';
import { meResponseSchema } from './accounts.js';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const MINIMUM_AGE_YEARS = 18;
export const VERIFICATION_CODE_LENGTH = 6;

// Trims and lowercases before checking. The input side of that pipeline is a plain
// string, so the documented format is stated explicitly for the OpenAPI document.
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address' }).max(254))
  .meta({
    format: 'email',
    maxLength: 254,
    description: 'Compared without case or surrounding spaces.',
  });

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH);

export const signUpRequestSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    dateOfBirth: isoDateSchema,
    countryCode: z.string().length(2).toUpperCase(),
    acceptedTerms: z.literal(true, {
      error: 'You must accept the terms and community guidelines',
    }),
    deviceId: deviceIdSchema,
  })
  .meta({ id: 'SignUpRequest' });
export type SignUpRequest = z.infer<typeof signUpRequestSchema>;

export const signInRequestSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
    deviceId: deviceIdSchema,
  })
  .meta({ id: 'SignInRequest' });
export type SignInRequest = z.infer<typeof signInRequestSchema>;

export const refreshRequestSchema = z
  .object({
    refreshToken: z.string().min(32).max(256),
    deviceId: deviceIdSchema,
  })
  .meta({ id: 'RefreshRequest' });
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const signOutRequestSchema = z
  .object({
    refreshToken: z.string().min(32).max(256),
  })
  .meta({ id: 'SignOutRequest' });
export type SignOutRequest = z.infer<typeof signOutRequestSchema>;

/** Always answered the same way, so it cannot be used to learn who has an account. */
export const passwordResetRequestSchema = z
  .object({
    email: emailSchema,
  })
  .meta({ id: 'PasswordResetRequest' });
export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z
  .object({
    email: emailSchema,
    code: z
      .string()
      .regex(new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`), 'Enter the 6-digit code'),
    newPassword: passwordSchema,
  })
  .meta({ id: 'PasswordResetConfirm' });
export type PasswordResetConfirm = z.infer<typeof passwordResetConfirmSchema>;

export const verifyEmailRequestSchema = z
  .object({
    code: z
      .string()
      .regex(new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`), 'Enter the 6-digit code'),
  })
  .meta({ id: 'VerifyEmailRequest' });
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const sessionTokensSchema = z
  .object({
    accessToken: z.string(),
    accessTokenExpiresAt: isoDateTimeSchema,
    refreshToken: z.string(),
    refreshTokenExpiresAt: isoDateTimeSchema,
  })
  .meta({ id: 'SessionTokens' });
export type SessionTokens = z.infer<typeof sessionTokensSchema>;

export const authResponseSchema = z
  .object({
    tokens: sessionTokensSchema,
    me: meResponseSchema,
  })
  .meta({ id: 'AuthResponse' });
export type AuthResponse = z.infer<typeof authResponseSchema>;

/**
 * Browsers get the access token only. The refresh token travels in an HttpOnly
 * cookie the page cannot read (ADR-024), so a script injected into the page cannot steal it.
 */
export const webAuthResponseSchema = z
  .object({
    accessToken: z.string(),
    accessTokenExpiresAt: isoDateTimeSchema,
    me: meResponseSchema,
  })
  .meta({ id: 'WebAuthResponse' });
export type WebAuthResponse = z.infer<typeof webAuthResponseSchema>;

export const webRefreshRequestSchema = z
  .object({
    deviceId: deviceIdSchema,
  })
  .meta({ id: 'WebRefreshRequest' });
export type WebRefreshRequest = z.infer<typeof webRefreshRequestSchema>;
