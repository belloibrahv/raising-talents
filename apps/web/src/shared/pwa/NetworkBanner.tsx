import { WifiOff } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { t } from '../../i18n';

const subscribe = (callback: () => void) => {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
};

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine);
}

/** Says so when the connection drops, so a failed save is never a surprise. */
export function NetworkBanner() {
  const online = useOnline();
  return (
    <div role="status" aria-live="polite">
      {online ? null : (
        <p className="flex items-center justify-center gap-2 bg-primary px-4 py-2 text-center text-sm font-semibold text-primary-foreground">
          <WifiOff aria-hidden="true" className="size-4" />
          {t('pwa.offline')}
        </p>
      )}
    </div>
  );
}
