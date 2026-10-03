import base from '@rt/config/eslint';

export default [
  ...base,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    ignores: [
      'dist/**',
      'scripts/**',
      'drizzle/**',
      'eslint.config.mjs',
      'vitest.config.ts',
      'drizzle.config.ts',
    ],
  },
];
