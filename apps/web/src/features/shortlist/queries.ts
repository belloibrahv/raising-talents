import type { ShortlistEntry, ShortlistPage } from '@rt/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '../../shared/api/api-error';
import { api } from '../../shared/api/client';

export const shortlistKey = ['shortlist'] as const;
const entryKey = (handle: string) => [...shortlistKey, 'entry', handle] as const;

export function useShortlist() {
  return useInfiniteQuery({
    queryKey: [...shortlistKey, 'list'],
    queryFn: ({ pageParam }) =>
      api.call('shortlist.list', { query: pageParam ? { cursor: pageParam } : {} }),
    initialPageParam: '',
    getNextPageParam: (last: ShortlistPage) => last.nextCursor ?? undefined,
  });
}

/** The saved entry, or null when this talent is not on the shortlist. */
export function useShortlistEntry(handle: string, enabled: boolean) {
  return useQuery({
    queryKey: entryKey(handle),
    enabled,
    queryFn: async (): Promise<ShortlistEntry | null> => {
      try {
        return await api.call('shortlist.get', { params: { handle } });
      } catch (error) {
        if (isApiError(error, 'NOT_FOUND')) return null;
        throw error;
      }
    },
  });
}

export function useSaveToShortlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { handle: string; note?: string }) =>
      api.call('shortlist.save', {
        params: { handle: input.handle },
        body: input.note === undefined ? {} : { note: input.note },
      }),
    // The list refreshes in the background, so the button is ready again at once.
    onSuccess: (entry) => {
      queryClient.setQueryData(entryKey(entry.talent.handle), entry);
      void queryClient.invalidateQueries({ queryKey: [...shortlistKey, 'list'] });
    },
  });
}

export function useRemoveFromShortlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (handle: string) => api.call('shortlist.remove', { params: { handle } }),
    onSuccess: (_result, handle) => {
      queryClient.setQueryData(entryKey(handle), null);
      void queryClient.invalidateQueries({ queryKey: [...shortlistKey, 'list'] });
    },
  });
}
