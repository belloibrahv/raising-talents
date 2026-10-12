import { describe, expect, it } from 'vitest';
import { checkPasswordPolicy } from './password-policy.js';

describe('checkPasswordPolicy', () => {
  it('accepts any password of eight characters or more', () => {
    expect(checkPasswordPolicy('midfield-maestro-2026').ok).toBe(true);
    expect(checkPasswordPolicy('lagos123').ok).toBe(true);
  });

  it('rejects passwords that are too short or far too long', () => {
    expect(checkPasswordPolicy('short12').ok).toBe(false);
    expect(checkPasswordPolicy('a'.repeat(129)).ok).toBe(false);
  });
});
