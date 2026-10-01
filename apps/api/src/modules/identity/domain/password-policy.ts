import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@rt/contracts';
import type { DomainError } from '../../../platform/domain-error.js';
import { err, ok, type Result } from '../../../platform/result.js';
import { IdentityErrors } from './identity.errors.js';

/**
 * Rules a new password must meet before it is hashed. Length is checked again
 * here so the rule holds even if a caller skips the request schema.
 * The breached-password check runs separately because it calls an outside service.
 */
export function checkPasswordPolicy(password: string, email: string): Result<void, DomainError> {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return err(
      IdentityErrors.weakPassword(
        `Use between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
      ),
    );
  }
  if (new Set(password).size < 4) {
    return err(IdentityErrors.weakPassword('Use a mix of different characters.'));
  }
  const localPart = email.split('@')[0]?.toLowerCase() ?? '';
  if (localPart.length >= 4 && password.toLowerCase().includes(localPart)) {
    return err(IdentityErrors.weakPassword('Do not use your email address in your password.'));
  }
  return ok(undefined);
}
