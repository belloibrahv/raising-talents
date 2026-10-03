import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '../shared/api/api-error';
import { reportError } from '../shared/observability/error-reporting';

/** Retries only what a retry can fix: dropped connections and server errors, never a 4xx. */
export function createQueryClient(): QueryClient {
  const retry = (failures: number, error: unknown) =>
    failures < 2 && !(error instanceof ApiError && error.problem.status < 500);
  return new QueryClient({
    // Screens show their own errors; these only send the ones worth a look (toReport).
    queryCache: new QueryCache({
      onError: (error, query) => {
        reportError(error, { query: String(query.queryKey[0]) });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error) => {
        reportError(error, { source: 'mutation' });
      },
    }),
    defaultOptions: {
      queries: { retry, staleTime: 30_000, refetchOnWindowFocus: true },
      mutations: { retry: false },
    },
  });
}
