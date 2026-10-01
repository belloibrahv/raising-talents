import { describe, expect, it } from 'vitest';
import { signUpRequestSchema, verifyEmailRequestSchema } from './auth.js';

const validSignUp = {
  email: '  Amaka.Okafor@Example.com ',
  password: 'football-lagos-2026',
  dateOfBirth: '2001-04-17',
  countryCode: 'ng',
  acceptedTerms: true,
  deviceId: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b',
};

describe('signUpRequestSchema', () => {
  it('normalises email and country code', () => {
    const parsed = signUpRequestSchema.parse(validSignUp);
    expect(parsed.email).toBe('amaka.okafor@example.com');
    expect(parsed.countryCode).toBe('NG');
  });

  it('rejects a short password', () => {
    const result = signUpRequestSchema.safeParse({ ...validSignUp, password: 'short' });
    expect(result.success).toBe(false);
  });

  it('requires the terms to be accepted', () => {
    const result = signUpRequestSchema.safeParse({ ...validSignUp, acceptedTerms: false });
    expect(result.success).toBe(false);
  });
});

describe('verifyEmailRequestSchema', () => {
  it('accepts exactly six digits', () => {
    expect(verifyEmailRequestSchema.safeParse({ code: '482913' }).success).toBe(true);
    expect(verifyEmailRequestSchema.safeParse({ code: '48291' }).success).toBe(false);
    expect(verifyEmailRequestSchema.safeParse({ code: '48291a' }).success).toBe(false);
  });
});
