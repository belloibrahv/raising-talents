import base from '@rt/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...base,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    ignores: [
      '.expo/**',
      'dist/**',
      'eslint.config.mjs',
      'vitest.config.ts',
      'expo-env.d.ts',
      'app.config.ts',
      'metro.config.js',
    ],
  },
];
