import type { MeResponse, SelectableRole, SignUpRequest } from '@rt/contracts';
import { api, http } from '../../shared/api/client';
import { getDeviceId } from '../../shared/storage/device-id';

export type SignUpInput = Omit<SignUpRequest, 'deviceId'>;

export const authApi = {
  async signUp(input: SignUpInput): Promise<MeResponse> {
    const response = await api.call('auth.signUp', {
      body: { ...input, deviceId: await getDeviceId() },
    });
    await http.startSession(response.tokens);
    return response.me;
  },

  async signIn(email: string, password: string): Promise<MeResponse> {
    const response = await api.call('auth.signIn', {
      body: { email, password, deviceId: await getDeviceId() },
    });
    await http.startSession(response.tokens);
    return response.me;
  },

  me(): Promise<MeResponse> {
    return api.call('me.get');
  },

  verifyEmail(code: string): Promise<MeResponse> {
    return api.call('auth.verifyEmail', { body: { code } });
  },

  resendCode(): Promise<void> {
    return api.call('auth.resendVerification');
  },

  chooseRole(role: SelectableRole): Promise<MeResponse> {
    return api.call('me.selectRole', { body: { role } });
  },

  /** Ends the session on the server when possible, and always on the device. */
  async signOut(): Promise<void> {
    const refreshToken = http.refreshToken();
    try {
      if (refreshToken) await api.call('auth.signOut', { body: { refreshToken } });
    } catch {
      // Offline sign-out still clears the device. The server session expires on its own.
    } finally {
      await http.endSession();
    }
  },

  hasStoredSession(): Promise<boolean> {
    return http.hasSession();
  },
};
