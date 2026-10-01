import type { MeResponse } from '@rt/contracts';
import { create } from 'zustand';
import type { SessionStatus } from './route-for-session';

interface SessionState {
  readonly status: SessionStatus;
  readonly me: MeResponse | null;
  readonly restoring: () => void;
  readonly unreachable: () => void;
  readonly signedIn: (me: MeResponse) => void;
  readonly signedOut: () => void;
}

/** Who is signed in. Tokens are not kept here: they live in the HTTP client and the keychain. */
export const useSession = create<SessionState>()((set) => ({
  status: 'restoring',
  me: null,
  restoring: () => {
    set({ status: 'restoring' });
  },
  unreachable: () => {
    set({ status: 'unreachable' });
  },
  signedIn: (me) => {
    set({ status: 'signedIn', me });
  },
  signedOut: () => {
    set({ status: 'signedOut', me: null });
  },
}));
