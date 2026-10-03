import { sessionTokensSchema, type SessionTokens } from '@rt/contracts';
import * as SecureStore from 'expo-secure-store';
import type { SessionStorage } from './session-storage';

const KEY = 'rt.session.v1';

/**
 * Keychain on iOS, Keystore-backed storage on Android. Only readable after the
 * device is first unlocked, and never included in device backups.
 */
export class SecureSessionStorage implements SessionStorage {
  private readonly options: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  };

  async load(): Promise<SessionTokens | null> {
    const raw = await SecureStore.getItemAsync(KEY, this.options);
    if (!raw) return null;
    try {
      const parsed = sessionTokensSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  async save(tokens: SessionTokens): Promise<void> {
    await SecureStore.setItemAsync(KEY, JSON.stringify(tokens), this.options);
  }

  async clear(): Promise<void> {
    await SecureStore.deleteItemAsync(KEY, this.options);
  }
}
