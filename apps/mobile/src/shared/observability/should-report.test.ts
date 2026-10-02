import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '../api/api-error';
import { toReport } from './should-report';

const apiError = (status: number, code: string, traceId?: string) =>
  new ApiError({
    type: 'about:blank',
    title: 'Error',
    status,
    code: code as 'INTERNAL',
    ...(traceId ? { traceId } : {}),
  });

describe('toReport', () => {
  it('ignores expected outcomes: wrong input, ended sessions, no signal', () => {
    expect(toReport(apiError(422, 'VERIFICATION_CODE_INVALID'))).toBeNull();
    expect(toReport(apiError(401, 'SESSION_REVOKED'))).toBeNull();
    expect(toReport(new NetworkError(new TypeError('Network request failed')))).toBeNull();
  });

  it('reports server failures with the trace id that leads to the server trace', () => {
    expect(toReport(apiError(500, 'INTERNAL', 'a3321e65da36d002df4c794cc6226586'))?.tags).toEqual({
      api_code: 'INTERNAL',
      api_status: '500',
      api_trace_id: 'a3321e65da36d002df4c794cc6226586',
    });
  });

  it('reports bugs in the app itself', () => {
    expect(
      toReport(new TypeError("Cannot read properties of undefined (reading 'email')")),
    ).not.toBeNull();
  });
});
