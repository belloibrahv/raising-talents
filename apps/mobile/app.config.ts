import type { ExpoConfig } from 'expo/config';

// Identifiers are placeholders until the client confirms who owns the Apple and Google accounts
// (open question 5 in the design document). Changing them later means a fresh install for testers.
// Source maps upload to Sentry only from EAS builds that have the Sentry project configured.
const sentryPlugin: [string, Record<string, string>][] =
  process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
    ? [
        [
          '@sentry/react-native/expo',
          { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT },
        ],
      ]
    : [];

const config: ExpoConfig = {
  name: 'Raising Talents',
  slug: 'raising-talents',
  scheme: 'raisingtalents',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'app.raisingtalents.mobile',
    supportsTablet: false,
  },
  android: {
    package: 'app.raisingtalents.mobile',
  },
  plugins: [
    'expo-router',
    'expo-status-bar',
    'expo-secure-store',
    'expo-font',
    ['expo-splash-screen', { backgroundColor: '#FFFFFF', imageWidth: 120 }],
    ...sentryPlugin,
  ],
  experiments: {
    typedRoutes: true,
  },
};

export default config;
