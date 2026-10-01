import type { SessionTokens } from '@rt/contracts';

/** Where the token pair lives between app launches. Production uses the device keychain. */
export interface SessionStorage {
  load(): Promise<SessionTokens | null>;
  save(tokens: SessionTokens): Promise<void>;
  clear(): Promise<void>;
}

/** Holds tokens in memory. Used by tests. */
export class MemorySessionStorage implements SessionStorage {
  private tokens: SessionTokens | null = null;

  constructor(initial: SessionTokens | null = null) {
    this.tokens = initial;
  }

  load(): Promise<SessionTokens | null> {
    return Promise.resolve(this.tokens);
  }

  save(tokens: SessionTokens): Promise<void> {
    this.tokens = tokens;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.tokens = null;
    return Promise.resolve();
  }
}
