import { ApiError } from '../../shared/api/api-error';

/** Pulls per-field messages out of a VALIDATION_FAILED answer, keyed by field name. */
export function fieldErrorsFrom(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.problem.fields) return {};
  return Object.fromEntries(error.problem.fields.map((field) => [field.path, field.message]));
}
