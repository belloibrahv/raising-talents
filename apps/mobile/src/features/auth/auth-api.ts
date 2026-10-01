import {
  authResponseSchema,
  meResponseSchema,
  type MeResponse,
  type SelectableRole,
  type SignUpRequest,
} from '@rt/contracts';
import { http } from '../../shared/api/client';
import { getDeviceId } from '../../shared/storage/device-id';

export type SignUpInput = Omit<SignUpRequest, 'deviceId'>;

export const authApi = {
  async signUp(input: SignUpInput): Promise<MeResponse> {
    const response = await http.request('/v1/auth/sign-up', {
      method: 'POST',
      body: { ...input, deviceId: await getDeviceId() },
      authenticated: false,
      schema: authResponseSchema,
    });
    await http.startSession(response.tokens);
    return response.me;
  },

  async signIn(email: string, password: string): Promise<MeResponse> {
    const response = await http.request('/v1/auth/sign-in', {
      method: 'POST',
      body: { email, password, deviceId: await getDeviceId() },
      authenticated: false,
      schema: authResponseSchema,
    });
    await http.startSession(response.tokens);
    return response.me;
  },

  me(): Promise<MeResponse> {
    return http.request('/v1/me', { schema: meResponseSchema });
  },

  verifyEmail(code: string): Promise<MeResponse> {
    return http.request('/v1/auth/verify-email', {
      method: 'POST',
      body: { code },
      schema: meResponseSchema,
    });
  },

  async resendCode(): Promise<void> {
    await http.request('/v1/auth/verify-email/resend', { method: 'POST' });
  },

  chooseRole(role: SelectableRole): Promise<MeResponse> {
    return http.request('/v1/me/role', {
      method: 'POST',
      body: { role },
      schema: meResponseSchema,
    });
  },

  /** Ends the session on the server when possible, and always on the device. */
  async signOut(): Promise<void> {
    const refreshToken = http.refreshToken();
    try {
      if (refreshToken) {
        await http.request('/v1/auth/sign-out', {
          method: 'POST',
          body: { refreshToken },
          authenticated: false,
        });
      }
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
