import type { SelectableRole } from '@rt/contracts';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { NetworkError } from '../../shared/api/api-error';
import { authApi, type SignUpInput } from './auth-api';
import { useSession } from './session-store';

/** Runs once at launch: decides whether the person is signed in, and who they are. */
export function useRestoreSession(): { retry: () => void } {
  const restore = useCallback(async () => {
    const session = useSession.getState();
    session.restoring();
    if (!(await authApi.hasStoredSession())) {
      session.signedOut();
      return;
    }
    try {
      session.signedIn(await authApi.me());
    } catch (error) {
      if (error instanceof NetworkError) session.unreachable();
      else session.signedOut();
    }
  }, []);

  useEffect(() => {
    void restore();
  }, [restore]);

  return { retry: () => void restore() };
}

export function useSignUp() {
  const signedIn = useSession((state) => state.signedIn);
  return useMutation({
    mutationFn: (input: SignUpInput) => authApi.signUp(input),
    onSuccess: signedIn,
  });
}

export function useSignIn() {
  const signedIn = useSession((state) => state.signedIn);
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      authApi.signIn(input.email, input.password),
    onSuccess: signedIn,
  });
}

export function useVerifyEmail() {
  const signedIn = useSession((state) => state.signedIn);
  return useMutation({
    mutationFn: (code: string) => authApi.verifyEmail(code),
    onSuccess: signedIn,
  });
}

export function useResendCode() {
  return useMutation({ mutationFn: () => authApi.resendCode() });
}

export function useChooseRole() {
  const signedIn = useSession((state) => state.signedIn);
  return useMutation({
    mutationFn: (role: SelectableRole) => authApi.chooseRole(role),
    onSuccess: signedIn,
  });
}

export function useSignOut() {
  const signedOut = useSession((state) => state.signedOut);
  return useMutation({ mutationFn: () => authApi.signOut(), onSettled: signedOut });
}
