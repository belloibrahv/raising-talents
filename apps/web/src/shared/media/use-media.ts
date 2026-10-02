import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { SETTLED_STATES } from './upload';

/** Follows one asset through processing and scanning, polling until it settles. */
export function useMediaStatus(mediaId: string | null) {
  return useQuery({
    queryKey: ['media', mediaId],
    queryFn: () => api.call('media.get', { params: { mediaId: mediaId ?? '' } }),
    enabled: mediaId !== null,
    refetchInterval: (query) =>
      query.state.data && SETTLED_STATES.has(query.state.data.status) ? false : 2000,
  });
}
