import type { SelectableRole } from '@rt/contracts';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { NetworkError } from '../../shared/api/api-error';
import { http, session } from '../../shared/api/client';
import type { SessionState } from '../../shared/session/session-store';
import { authApi, type SignUpInput } from './auth-api';

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}

/** Runs once at start-up and again when the connection comes back after a failed attempt. */
export function useRestoreSession(): { retry: () => void } {
  const restore = useCallback(async () => {
    session.restoring();
    try {
      const me = await http.restore();
      if (me) session.signedIn(me);
      else session.signedOut();
    } catch (error) {
      if (error instanceof NetworkError) session.unreachable();
      else session.signedOut();
    }
  }, []);

  useEffect(() => {
    void restore();
    const onOnline = () => {
      if (session.getSnapshot().status === 'unreachable') void restore();
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, [restore]);

  return { retry: () => void restore() };
}

const signedIn = (me: Parameters<typeof session.signedIn>[0]) => {
  session.signedIn(me, { announce: true });
};

export function useSignUp() {
  return useMutation({
    mutationFn: (input: SignUpInput) => authApi.signUp(input),
    onSuccess: signedIn,
  });
}

export function useSignIn() {
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      authApi.signIn(input.email, input.password),
    onSuccess: signedIn,
  });
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (code: string) => authApi.verifyEmail(code),
    onSuccess: signedIn,
  });
}

export function useResendCode() {
  return useMutation({ mutationFn: () => authApi.resendCode() });
}

export function useChooseRole() {
  return useMutation({
    mutationFn: (role: SelectableRole) => authApi.chooseRole(role),
    onSuccess: signedIn,
  });
}

export function useSignOut() {
  return useMutation({
    mutationFn: () => authApi.signOut(),
    onSettled: () => {
      session.signedOut({ announce: true });
    },
  });
}
