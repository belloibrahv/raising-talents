/** Where the API lives. Set VITE_API_URL at build time; local development defaults to the API on port 3000. */
export const API_URL: string =
  (import.meta.env['VITE_API_URL'] as string | undefined) ?? 'http://localhost:3000';

export const LEGAL_URLS = {
  terms: 'https://raisingtalents.app/terms',
  guidelines: 'https://raisingtalents.app/community-guidelines',
  privacy: 'https://raisingtalents.app/privacy',
} as const;

/** Nigeria first (ADR-013). Sign-up sends it until the country picker arrives. */
export const LAUNCH_COUNTRY_CODE = 'NG';
