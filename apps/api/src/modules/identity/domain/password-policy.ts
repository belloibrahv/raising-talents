import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@rt/contracts';
import type { DomainError } from '../../../platform/domain-error.js';
import { err, ok, type Result } from '../../../platform/result.js';
import { IdentityErrors } from './identity.errors.js';

/**
 * The one rule a new password must meet before it is hashed: its length. It is checked again
 * here so the rule holds even if a caller skips the request schema. Sign-up is kept easy on
 * purpose; the check against very common passwords runs separately because it calls an
 * outside service.
 */
export function checkPasswordPolicy(password: string): Result<void, DomainError> {
  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    return err(
      IdentityErrors.weakPassword(
        `Use between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
      ),
    );
  }
  return ok(undefined);
}
