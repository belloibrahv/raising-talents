import type { NotificationPage } from '@rt/contracts';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const notificationsKey = ['notifications'] as const;
const unreadKey = [...notificationsKey, 'unread'] as const;

/** For the bell: checked every minute and whenever the app comes back to the front. */
export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: unreadKey,
    queryFn: () => api.call('notifications.unread'),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useNotifications() {
  return useInfiniteQuery({
    queryKey: [...notificationsKey, 'list'],
    queryFn: ({ pageParam }) =>
      api.call('notifications.list', { query: pageParam ? { cursor: pageParam } : {} }),
    initialPageParam: '',
    getNextPageParam: (last: NotificationPage) => last.nextCursor ?? undefined,
  });
}

export function useMarkAllRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.call('notifications.markRead'),
    onSuccess: () => {
      queryClient.setQueryData(unreadKey, { unread: 0 });
    },
  });
}
