import { ApiError, NetworkError } from '../shared/api/api-error';
import { t, type CopyKey } from './index';
import en from './en.json';

/** Codes where the server's detail says more than our generic line: which rule failed, attempts left. */
const SERVER_DETAIL_CODES = new Set(['WEAK_PASSWORD', 'VERIFICATION_CODE_INVALID']);

/** What to tell the person for any error a request can produce. */
export function errorMessage(error: unknown): string {
  if (error instanceof NetworkError) return t('errors.NETWORK');
  if (error instanceof ApiError) {
    if (SERVER_DETAIL_CODES.has(error.code) && error.problem.detail) return error.problem.detail;
    const key = `errors.${error.code}`;
    if (error.code in en.errors) return t(key as CopyKey);
    return error.problem.detail ?? t('errors.INTERNAL');
  }
  return t('errors.INTERNAL');
}
