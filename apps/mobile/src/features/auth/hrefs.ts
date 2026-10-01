import type { AppArea } from './route-for-session';

export const HOME_OF: Record<AppArea, '/welcome' | '/verify-email' | '/choose-role' | '/home'> = {
  auth: '/welcome',
  verifyEmail: '/verify-email',
  chooseRole: '/choose-role',
  app: '/home',
};
