import { z } from 'zod';
import { deviceIdSchema, isoDateSchema, isoDateTimeSchema } from './common.js';
import { meResponseSchema } from './accounts.js';

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const MINIMUM_AGE_YEARS = 18;
export const VERIFICATION_CODE_LENGTH = 6;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Enter a valid email address' }).max(254));

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH);

export const signUpRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  dateOfBirth: isoDateSchema,
  countryCode: z.string().length(2).toUpperCase(),
  acceptedTerms: z.literal(true, {
    error: 'You must accept the terms and community guidelines',
  }),
  deviceId: deviceIdSchema,
});
export type SignUpRequest = z.infer<typeof signUpRequestSchema>;

export const signInRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  deviceId: deviceIdSchema,
});
export type SignInRequest = z.infer<typeof signInRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(32).max(256),
  deviceId: deviceIdSchema,
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const signOutRequestSchema = z.object({
  refreshToken: z.string().min(32).max(256),
});
export type SignOutRequest = z.infer<typeof signOutRequestSchema>;

export const verifyEmailRequestSchema = z.object({
  code: z
    .string()
    .regex(new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`), 'Enter the 6-digit code'),
});
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

export const sessionTokensSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: isoDateTimeSchema,
  refreshToken: z.string(),
  refreshTokenExpiresAt: isoDateTimeSchema,
});
export type SessionTokens = z.infer<typeof sessionTokensSchema>;

export const authResponseSchema = z.object({
  tokens: sessionTokensSchema,
  me: meResponseSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
