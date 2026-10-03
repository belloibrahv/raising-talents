import { ErrorCode, problemDetailsSchema } from '@rt/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '../shared/api/api-error';
import en from './en.json';
import { errorMessage } from './error-message';
import { t } from './index';

describe('copy', () => {
  it('has a message for every error code the API can return', () => {
    const missing = Object.values(ErrorCode).filter((code) => !(code in en.errors));
    expect(missing).toEqual([]);
  });

  it('fills placeholders', () => {
    expect(t('verifyEmail.resendIn', { seconds: 42 })).toBe('Send a new code in 42s');
  });

  it('prefers the server detail where it says more', () => {
    const problem = problemDetailsSchema.parse({
      type: 'https://api.raisingtalents.app/errors/verification-code-invalid',
      title: 'Request cannot be completed',
      status: 422,
      code: 'VERIFICATION_CODE_INVALID',
      detail: 'That code is not right. 3 attempt(s) left.',
    });
    expect(errorMessage(new ApiError(problem))).toBe('That code is not right. 3 attempt(s) left.');
    expect(errorMessage(new NetworkError(new Error('offline')))).toBe(en.errors.NETWORK);
  });
});
