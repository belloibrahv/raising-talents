import type { ConversationPage, ConversationSummary, MessagePage } from '@rt/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '../../shared/api/api-error';
import { api } from '../../shared/api/client';

/**
 * Delivery is polling for now (ADR-038). Queries only poll while the tab is visible, which is
 * TanStack Query's default, so a phone in a pocket stays quiet.
 */
const THREAD_POLL_MS = 5_000;
const LIST_POLL_MS = 20_000;
const BADGE_POLL_MS = 45_000;

export const messagesKey = ['messages'] as const;
const listKey = [...messagesKey, 'list'] as const;
const unreadKey = [...messagesKey, 'unread'] as const;
const conversationKey = (id: string) => [...messagesKey, 'conversation', id] as const;
const threadKey = (id: string) => [...messagesKey, 'thread', id] as const;
const withTalentKey = (handle: string) => [...messagesKey, 'with', handle] as const;

export function useMessagingUnread(enabled: boolean) {
  return useQuery({
    queryKey: unreadKey,
    queryFn: () => api.call('messaging.unread'),
    enabled,
    refetchInterval: BADGE_POLL_MS,
  });
}

export function useConversations() {
  return useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) =>
      api.call('messaging.list', { query: pageParam ? { cursor: pageParam } : {} }),
    initialPageParam: '',
    getNextPageParam: (last: ConversationPage) => last.nextCursor ?? undefined,
    refetchInterval: LIST_POLL_MS,
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: conversationKey(id),
    queryFn: () => api.call('messaging.get', { params: { conversationId: id } }),
    retry: (failures, error) => !isApiError(error, 'NOT_FOUND') && failures < 2,
    refetchInterval: THREAD_POLL_MS,
  });
}

/** Newest page first from the API; the screen shows them oldest at the top. */
export function useThread(id: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: threadKey(id),
    queryFn: ({ pageParam }) =>
      api.call('messaging.messages', {
        params: { conversationId: id },
        query: pageParam ? { cursor: pageParam } : {},
      }),
    initialPageParam: '',
    getNextPageParam: (last: MessagePage) => last.nextCursor ?? undefined,
    enabled,
    refetchInterval: THREAD_POLL_MS,
  });
}

/** The agent's conversation with this talent, or null when there is none yet. */
export function useConversationWithTalent(handle: string, enabled: boolean) {
  return useQuery({
    queryKey: withTalentKey(handle),
    enabled,
    queryFn: async (): Promise<ConversationSummary | null> => {
      try {
        return await api.call('messaging.withTalent', { params: { handle } });
      } catch (error) {
        if (isApiError(error, 'NOT_FOUND')) return null;
        throw error;
      }
    },
  });
}

function useRefreshAfter() {
  const queryClient = useQueryClient();
  return (summary: ConversationSummary) => {
    queryClient.setQueryData(conversationKey(summary.id), summary);
    if (summary.counterpart.kind === 'talent') {
      queryClient.setQueryData(withTalentKey(summary.counterpart.handle), summary);
    }
    void queryClient.invalidateQueries({ queryKey: listKey });
    void queryClient.invalidateQueries({ queryKey: unreadKey });
    void queryClient.invalidateQueries({ queryKey: threadKey(summary.id) });
  };
}

export function useRequestContact() {
  const refresh = useRefreshAfter();
  return useMutation({
    mutationFn: (input: { handle: string; message: string; clientMessageId: string }) =>
      api.call('messaging.requestContact', {
        params: { handle: input.handle },
        body: { message: input.message, clientMessageId: input.clientMessageId },
      }),
    onSuccess: refresh,
  });
}

export function useRespond(id: string) {
  const refresh = useRefreshAfter();
  return useMutation({
    mutationFn: (decision: 'accept' | 'decline') =>
      api.call('messaging.respond', { params: { conversationId: id }, body: { decision } }),
    onSuccess: refresh,
  });
}

export function useWithdraw(id: string) {
  const refresh = useRefreshAfter();
  return useMutation({
    mutationFn: () => api.call('messaging.withdraw', { params: { conversationId: id } }),
    onSuccess: refresh,
  });
}

export function useSendMessage(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; clientMessageId: string }) =>
      api.call('messaging.send', { params: { conversationId: id }, body: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: threadKey(id) });
      void queryClient.invalidateQueries({ queryKey: conversationKey(id) });
      void queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}

export function useMarkConversationRead(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.call('messaging.markRead', { params: { conversationId: id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: unreadKey });
      void queryClient.invalidateQueries({ queryKey: listKey });
      void queryClient.invalidateQueries({ queryKey: conversationKey(id) });
    },
  });
}
