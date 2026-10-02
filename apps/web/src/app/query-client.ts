import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '../shared/api/api-error';

/** Retries only what a retry can fix: dropped connections and server errors, never a 4xx. */
export function createQueryClient(): QueryClient {
  const retry = (failures: number, error: unknown) =>
    failures < 2 && !(error instanceof ApiError && error.problem.status < 500);
  return new QueryClient({
    defaultOptions: {
      queries: { retry, staleTime: 30_000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}
