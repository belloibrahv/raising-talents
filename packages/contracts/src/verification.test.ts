import { describe, expect, it } from 'vitest';
import { requestAgentVerificationSchema } from './verification.js';

describe('requestAgentVerificationSchema', () => {
  it('normalises CAC numbers as companies write them', () => {
    for (const written of ['RC 123456', 'rc123456', 'RC-123456', ' rc 123456 ']) {
      expect(
        requestAgentVerificationSchema.parse({
          evidenceUrl: 'https://eko.example/team',
          registrationNumber: written,
        }).registrationNumber,
      ).toBe('RC 123456');
    }
    expect(
      requestAgentVerificationSchema.parse({
        evidenceUrl: 'https://eko.example',
        registrationNumber: 'BN 1234567',
      }).registrationNumber,
    ).toBe('BN 1234567');
  });

  it('refuses plain http evidence, unknown CAC prefixes and extra fields', () => {
    expect(
      requestAgentVerificationSchema.safeParse({ evidenceUrl: 'http://eko.example' }).success,
    ).toBe(false);
    expect(
      requestAgentVerificationSchema.safeParse({
        evidenceUrl: 'https://eko.example',
        registrationNumber: 'XY 123456',
      }).success,
    ).toBe(false);
    expect(
      requestAgentVerificationSchema.safeParse({
        evidenceUrl: 'https://eko.example',
        verified: true,
      }).success,
    ).toBe(false);
  });
});
