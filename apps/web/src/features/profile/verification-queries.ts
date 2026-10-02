import { useQuery } from '@tanstack/react-query';
import { api } from '../../shared/api/client';

export const verificationKey = ['agentVerification', 'mine'] as const;

export function useMyVerification() {
  return useQuery({
    queryKey: verificationKey,
    queryFn: () => api.call('agentVerification.getMine'),
  });
}
