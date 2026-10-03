import { ErrorCode } from '@rt/contracts';
import { domainError } from '../../../platform/domain-error.js';

export const TalentProfileErrors = {
  notFound: () => domainError(ErrorCode.NotFound, 'You have not started your talent profile yet.'),
  wrongRole: () => domainError(ErrorCode.WrongRole, 'Only talent accounts have a talent profile.'),
  versionRequired: () =>
    domainError(
      ErrorCode.PreconditionRequired,
      'Send the If-Match header from your last read of this profile.',
    ),
  staleVersion: () =>
    domainError(
      ErrorCode.PreconditionFailed,
      'Your profile changed on another device. Reload it and try again.',
    ),
  handleTaken: (handle: string) =>
    domainError(ErrorCode.HandleTaken, `@${handle} is taken. Try another.`),
  handleReserved: (handle: string) =>
    domainError(ErrorCode.HandleInvalid, `@${handle} is reserved. Try another.`),
  subcategoriesWithoutCategory: () =>
    domainError(ErrorCode.ValidationFailed, 'Choose a category before choosing subcategories.'),
};
