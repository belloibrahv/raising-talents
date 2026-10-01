import { describe, expect, it } from 'vitest';
import { checkPasswordPolicy } from './password-policy.js';

describe('checkPasswordPolicy', () => {
  it('accepts a long, varied password', () => {
    expect(checkPasswordPolicy('midfield-maestro-2026', 'chidi.eze@example.com').ok).toBe(true);
  });

  it('rejects short passwords and repeated characters', () => {
    expect(checkPasswordPolicy('short', 'chidi.eze@example.com').ok).toBe(false);
    expect(checkPasswordPolicy('aaaaabbbbbaaaaa', 'chidi.eze@example.com').ok).toBe(false);
  });

  it('rejects passwords that contain the email name', () => {
    expect(checkPasswordPolicy('Chidi.Eze-goalkeeper', 'chidi.eze@example.com').ok).toBe(false);
  });
});
