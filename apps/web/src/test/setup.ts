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

// jsdom lays nothing out, so it has no scrolling. Lists that keep the active option in view call this.
Element.prototype.scrollIntoView = () => undefined;

// jsdom has the dialog element but not its methods. Opening sets the attribute; closing fires the event.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute('open', '');
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
};
