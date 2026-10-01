import { randomUUID } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const KEY = 'rt.device-id.v1';
let cached: string | undefined;

/**
 * A random id created once per install. The API ties each session to it, so a
 * refresh token copied to another phone is rejected. It identifies nothing about the person.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  const stored = await SecureStore.getItemAsync(KEY);
  if (stored) {
    cached = stored;
    return stored;
  }
  const created = randomUUID();
  await SecureStore.setItemAsync(KEY, created, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  cached = created;
  return created;
}
