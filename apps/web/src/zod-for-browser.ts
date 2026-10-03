import { config } from 'zod/v4/core';

// Zod probes for eval to compile faster validators. The Content-Security-Policy forbids eval,
// so the probe only produced a violation report on every visit; validation is the same without it.
// Zod reads this when each schema is built. Vite points every import of zod here, so it runs
// before any schema, whatever order the bundle's chunks load in.
config({ jitless: true });

export * from 'zod/v4';
export { default, default as z } from 'zod/v4';
