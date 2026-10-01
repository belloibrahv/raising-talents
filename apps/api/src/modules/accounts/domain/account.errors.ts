import { ErrorCode, MINIMUM_AGE_YEARS } from '@rt/contracts';
import { domainError } from '../../../platform/domain-error.js';

export const AccountErrors = {
  emailAlreadyRegistered: () =>
    domainError(
      ErrorCode.EmailAlreadyRegistered,
      'An account with this email already exists. Sign in instead.',
    ),
  underMinimumAge: () =>
    domainError(
      ErrorCode.UnderMinimumAge,
      `You must be ${MINIMUM_AGE_YEARS} or older to join Raising Talents.`,
    ),
  invalidDateOfBirth: () => domainError(ErrorCode.ValidationFailed, 'Enter a real date of birth.'),
  notFound: () => domainError(ErrorCode.NotFound, 'Account not found.'),
  suspended: () =>
    domainError(
      ErrorCode.AccountSuspended,
      'This account is suspended. Check your email for details.',
    ),
  banned: () =>
    domainError(
      ErrorCode.AccountBanned,
      'This account has been closed for breaking the community guidelines.',
    ),
  emailAlreadyVerified: () =>
    domainError(ErrorCode.EmailAlreadyVerified, 'Your email is already verified.'),
  emailNotVerified: () =>
    domainError(
      ErrorCode.EmailNotVerified,
      'Verify your email before choosing how you will use Raising Talents.',
    ),
  roleLocked: () =>
    domainError(ErrorCode.RoleAlreadyLocked, 'Your role is set. Contact support to change it.'),
};
