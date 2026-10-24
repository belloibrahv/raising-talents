import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const verificationKey = ['agentVerification', 'mine'] as const;

export function useMyVerification(enabled = true) {
  return useQuery({
    queryKey: verificationKey,
    enabled,
    queryFn: () => api.call('agentVerification.getMine'),
  });
}
