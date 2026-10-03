import type { MeResponse } from '@rt/contracts';
import type { SessionStatus } from './area';

export interface SessionState {
  readonly status: SessionStatus;
  readonly me: MeResponse | null;
}

type Listener = () => void;

/**
 * Who is signed in, shared by every screen. Other tabs are told about sign-in and
 * sign-out over a BroadcastChannel, so a person who signs out in one tab is signed out in all.
 */
export class SessionStore {
  private state: SessionState = { status: 'restoring', me: null };
  private readonly listeners = new Set<Listener>();
  private readonly channel: BroadcastChannel | null;

  constructor(
    channelName = 'rt.session',
    private readonly onOtherTabChanged: (signedIn: boolean) => void = () => {},
  ) {
    this.channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(channelName);
    this.channel?.addEventListener('message', (event: MessageEvent<{ signedIn: boolean }>) => {
      this.onOtherTabChanged(event.data.signedIn);
    });
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): SessionState => this.state;

  restoring(): void {
    this.set({ status: 'restoring', me: this.state.me });
  }

  unreachable(): void {
    this.set({ status: 'unreachable', me: null });
  }

  signedIn(me: MeResponse, options: { announce?: boolean } = {}): void {
    const wasSignedIn = this.state.status === 'signedIn';
    this.set({ status: 'signedIn', me });
    if (options.announce && !wasSignedIn) this.channel?.postMessage({ signedIn: true });
  }

  signedOut(options: { announce?: boolean } = {}): void {
    this.set({ status: 'signedOut', me: null });
    if (options.announce) this.channel?.postMessage({ signedIn: false });
  }

  private set(next: SessionState): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}
