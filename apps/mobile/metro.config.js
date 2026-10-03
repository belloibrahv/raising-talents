// Adds Sentry debug ids to bundles so stack traces from release builds map back to source.
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
