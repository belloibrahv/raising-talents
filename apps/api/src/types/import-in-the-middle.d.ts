// The package ships register-hooks.d.ts, but TypeScript looks for .d.mts next to a .mjs
// file and the package has no exports map. These lines mirror the shipped declaration.
declare module 'import-in-the-middle/register-hooks.mjs' {
  export function supportsSyncHooks(): boolean;
  export function register(options?: {
    include?: (string | RegExp)[];
    exclude?: (string | RegExp)[];
  }): void;
}
