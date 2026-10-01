import { useSession } from '../../features/auth/session-store';
import { API_URL } from '../config';
import { getDeviceId } from '../storage/device-id';
import { SecureSessionStorage } from '../storage/secure-session-storage';
import { HttpClient } from './http-client';

/** The app's single HTTP client. When the server ends the session, the app returns to sign-in. */
export const http = new HttpClient({
  baseUrl: API_URL,
  storage: new SecureSessionStorage(),
  deviceId: getDeviceId,
  onSessionEnded: () => {
    useSession.getState().signedOut();
  },
});
