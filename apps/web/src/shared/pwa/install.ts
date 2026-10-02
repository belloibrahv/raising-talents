import { useEffect, useState } from 'react';

/** Chromium's install event. Not in the DOM types yet. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'rt.installDismissedAt';
const ASK_AGAIN_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

export type InstallOffer =
  | { readonly kind: 'none' }
  | { readonly kind: 'prompt'; install: () => Promise<void>; dismiss: () => void }
  | { readonly kind: 'ios'; dismiss: () => void };

const isStandalone = () =>
  (typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches) ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** iOS Safari cannot be prompted; it needs Share, then Add to Home Screen. */
const isIosSafari = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

const recentlyDismissed = () => {
  const at = Number(localStorage.getItem(DISMISSED_KEY) ?? 0);
  return Date.now() - at < ASK_AGAIN_AFTER_MS;
};

/**
 * Whether to offer installing the app, and how. Never when already installed, and not
 * again for two weeks after someone says not now.
 */
export function useInstallOffer(): InstallOffer {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(() => isStandalone() || recentlyDismissed());

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setHidden(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setHidden(true);
  };

  if (hidden) return { kind: 'none' };
  if (deferred) {
    return {
      kind: 'prompt',
      dismiss,
      install: async () => {
        await deferred.prompt();
        const { outcome } = await deferred.userChoice;
        setDeferred(null);
        if (outcome === 'dismissed') dismiss();
      },
    };
  }
  return isIosSafari() ? { kind: 'ios', dismiss } : { kind: 'none' };
}
