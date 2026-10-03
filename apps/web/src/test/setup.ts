import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Screens load on demand and restore the session first. On a busy CI runner that can take
// more than the default second, and these tests check what appears, not how fast.
configure({ asyncUtilTimeout: 5000 });

// jsdom has no media queries; the app reads display-mode to know whether it is installed.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }),
});

// jsdom has no object URLs; the photo preview uses one.
URL.createObjectURL = () => 'blob:preview';
URL.revokeObjectURL = () => undefined;

afterEach(() => {
  cleanup();
  localStorage.clear();
});
