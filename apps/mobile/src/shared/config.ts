import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Where the API lives. Builds set EXPO_PUBLIC_API_URL (see eas.json).
 * In development we reach the API on the same machine that runs the Metro bundler,
 * which also works from a real phone on the same Wi-Fi.
 */
function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  if (configured) return configured.replace(/\/$/, '');

  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  if (devHost) return `http://${devHost}:3000`;
  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

export const API_URL = resolveApiUrl();

/** Pending the client's legal documents (open question 7 in the design document). */
export const LEGAL_URLS = {
  terms: 'https://raisingtalents.app/terms',
  guidelines: 'https://raisingtalents.app/community-guidelines',
  privacy: 'https://raisingtalents.app/privacy',
} as const;

/** Launch market (ADR-013). Sent with sign-up until more countries open. */
export const LAUNCH_COUNTRY_CODE = 'NG';
