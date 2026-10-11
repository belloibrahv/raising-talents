import type { AgentCard, AgentPage, PublicAgentProfile, SearchAgentsQuery } from '@rt/contracts';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { isApiError } from '../../shared/api/api-error';
import { api } from '../../shared/api/client';

export type AgentFilters = Omit<SearchAgentsQuery, 'cursor'>;

/** Every list of agents shares the 'agents' prefix, so saving one updates all of them. */
export const agentKeys = {
  all: ['agents'] as const,
  search: (filters: AgentFilters) => ['agents', 'search', filters] as const,
  saved: ['agents', 'saved'] as const,
  one: (id: string) => ['agent', id] as const,
};

const nextPage = (last: AgentPage) => last.nextCursor ?? undefined;

export function useAgents(filters: AgentFilters) {
  return useInfiniteQuery({
    queryKey: agentKeys.search(filters),
    queryFn: ({ pageParam }) =>
      api.call('agents.search', { query: { ...filters, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPage,
  });
}

export function useSavedAgents(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: agentKeys.saved,
    queryFn: ({ pageParam }) => api.call('agents.saved', { query: { cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: nextPage,
    enabled,
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: agentKeys.one(id),
    queryFn: () => api.call('agents.get', { params: { id } }),
    retry: (failures, error) => !isApiError(error, 'NOT_FOUND') && failures < 2,
  });
}

/** Saves or removes at once on screen, and puts it back if the server says no. */
export function useSaveAgent() {
  const queryClient = useQueryClient();
  const show = (id: string, saved: boolean) => {
    queryClient.setQueriesData<InfiniteData<AgentPage>>({ queryKey: agentKeys.all }, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((item: AgentCard) =>
                item.id === id ? { ...item, saved } : item,
              ),
            })),
          }
        : data,
    );
    queryClient.setQueryData<PublicAgentProfile>(agentKeys.one(id), (profile) =>
      profile ? { ...profile, saved } : profile,
    );
  };
  return useMutation({
    mutationFn: ({ id, save }: { id: string; save: boolean }) =>
      api.call(save ? 'agents.save' : 'agents.unsave', { params: { id } }),
    onMutate: ({ id, save }) => {
      show(id, save);
    },
    onError: (_error, { id, save }) => {
      show(id, !save);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: agentKeys.saved });
    },
  });
}
