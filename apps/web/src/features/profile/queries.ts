import type {
  MyAgentProfile,
  MyTalentProfile,
  UpdateAgentProfileRequest,
  UpdateTalentProfileRequest,
} from '@rt/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isApiError } from '../../shared/api/api-error';
import { api, session } from '../../shared/api/client';

export const keys = {
  taxonomy: ['taxonomy'] as const,
  cities: (countryCode: string) => ['taxonomy', 'cities', countryCode] as const,
  talentProfile: ['talentProfile', 'mine'] as const,
  agentProfile: ['agentProfile', 'mine'] as const,
};

/** Reference lists change only with a release, so one read lasts the visit. */
export function useTaxonomy() {
  return useQuery({
    queryKey: keys.taxonomy,
    queryFn: () => api.call('taxonomy.get'),
    staleTime: Infinity,
  });
}

/** A country's cities, largest first. Idle until a country is chosen. */
export function useCountryCities(countryCode: string) {
  return useQuery({
    queryKey: keys.cities(countryCode),
    queryFn: () => api.call('taxonomy.cities', { params: { code: countryCode } }),
    enabled: countryCode !== '',
    staleTime: Infinity,
  });
}

/** Null until the first step is saved: the API creates the profile on the first save. */
export function useMyTalentProfile() {
  return useQuery({
    queryKey: keys.talentProfile,
    queryFn: async (): Promise<MyTalentProfile | null> => {
      try {
        return await api.call('talentProfile.getMine');
      } catch (error) {
        if (isApiError(error, 'NOT_FOUND')) return null;
        throw error;
      }
    },
  });
}

export function useMyAgentProfile() {
  return useQuery({
    queryKey: keys.agentProfile,
    queryFn: async (): Promise<MyAgentProfile | null> => {
      try {
        return await api.call('agentProfile.getMine');
      } catch (error) {
        if (isApiError(error, 'NOT_FOUND')) return null;
        throw error;
      }
    },
  });
}

/** Reads the account again, for when the server has moved it on (onboarding completed). */
export async function refreshMe(): Promise<void> {
  session.signedIn(await api.call('me.get'));
}

/**
 * Waits for the worker to finish onboarding after a photo is sent for review (ADR-044),
 * then updates the session so the app opens. Gives up after a few seconds: the next
 * visit picks it up anyway.
 */
export async function waitUntilActive(tries = 10, delayMs = 1000): Promise<boolean> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const me = await api.call('me.get');
    if (me.status !== 'onboarding') {
      session.signedIn(me);
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
}

/**
 * Saves one step with the version from the last read. If another device saved first,
 * the API refuses with 412; the latest profile is loaded so the person can check it.
 */
export function useUpdateTalentProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateTalentProfileRequest) => {
      const current = queryClient.getQueryData<MyTalentProfile | null>(keys.talentProfile);
      return api.call('talentProfile.updateMine', {
        body: patch,
        ifMatch: current?.version ?? null,
      });
    },
    onSuccess: async (profile) => {
      const wasComplete = queryClient.getQueryData<MyTalentProfile | null>(
        keys.talentProfile,
      )?.isComplete;
      queryClient.setQueryData(keys.talentProfile, profile);
      if (profile.isComplete && !wasComplete) await refreshMe();
    },
    onError: async (error) => {
      if (isApiError(error, 'PRECONDITION_FAILED')) {
        await queryClient.invalidateQueries({ queryKey: keys.talentProfile });
      }
    },
  });
}

export function useUpdateAgentProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateAgentProfileRequest) => {
      const current = queryClient.getQueryData<MyAgentProfile | null>(keys.agentProfile);
      return api.call('agentProfile.updateMine', {
        body: patch,
        ifMatch: current?.version ?? null,
      });
    },
    onSuccess: async (profile) => {
      queryClient.setQueryData(keys.agentProfile, profile);
      if (profile.isComplete) await refreshMe();
    },
    onError: async (error) => {
      if (isApiError(error, 'PRECONDITION_FAILED')) {
        await queryClient.invalidateQueries({ queryKey: keys.agentProfile });
      }
    },
  });
}
