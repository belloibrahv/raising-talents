import type { MeResponse, SelectableRole, SignUpRequest } from '@rt/contracts';
import { api, http } from '../../shared/api/client';
import { deviceId } from '../../shared/device-id';

export type SignUpInput = Omit<SignUpRequest, 'deviceId'>;

export const authApi = {
  async signUp(input: SignUpInput): Promise<MeResponse> {
    const response = await api.call('authWeb.signUp', { body: { ...input, deviceId: deviceId() } });
    return http.startSession(response);
  },

  async signIn(email: string, password: string): Promise<MeResponse> {
    const response = await api.call('authWeb.signIn', {
      body: { email, password, deviceId: deviceId() },
    });
    return http.startSession(response);
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

  /** Ends the session on the server when possible, and always in this browser. */
  async signOut(): Promise<void> {
    try {
      await api.call('authWeb.signOut');
    } catch {
      // Offline sign-out still forgets the token here. The cookie expires on its own.
    } finally {
      http.forgetSession();
    }
  },
};
