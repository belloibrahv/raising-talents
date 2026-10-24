import { describe, expect, it } from 'vitest';
import { updateAgentProfileRequestSchema } from './profiles.js';
import { requestAgentVerificationSchema } from './verification.js';

describe('requestAgentVerificationSchema', () => {
  it('takes a web address with or without https://, and puts it in front', () => {
    for (const [written, stored] of [
      ['www.ekotalent.com/team', 'https://www.ekotalent.com/team'],
      [' ekotalent.com ', 'https://ekotalent.com'],
      ['https://instagram.com/ekotalent', 'https://instagram.com/ekotalent'],
    ]) {
      expect(requestAgentVerificationSchema.parse({ evidenceUrl: written }).evidenceUrl).toBe(
        stored,
      );
    }
  });

  it('refuses plain http, addresses that are not web pages, a CAC number and extra fields', () => {
    for (const evidenceUrl of [
      'http://eko.example',
      'eko',
      'javascript:alert(1)',
      'www.eko .com',
    ]) {
      expect(requestAgentVerificationSchema.safeParse({ evidenceUrl }).success).toBe(false);
    }
    // The CAC number is no longer asked for: agencies are not only in Nigeria (ADR-060).
    expect(
      requestAgentVerificationSchema.safeParse({
        evidenceUrl: 'https://eko.example',
        registrationNumber: 'RC 123456',
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

describe('agent profile website', () => {
  it('starts with www. as people type it, and clears with null', () => {
    expect(updateAgentProfileRequestSchema.parse({ website: 'www.ekotalent.com' }).website).toBe(
      'https://www.ekotalent.com',
    );
    expect(updateAgentProfileRequestSchema.parse({ website: null }).website).toBeNull();
    expect(
      updateAgentProfileRequestSchema.safeParse({ website: 'http://ekotalent.com' }).success,
    ).toBe(false);
  });
});
