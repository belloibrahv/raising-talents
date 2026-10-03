import { Sparkles } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { t } from '../../i18n';
import { Button } from '../ui/Button';

/** Checks for a new version every hour while the app is open. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Tells the person when a new version is ready and lets them choose when to switch,
 * so an update never reloads the page under a half-filled form.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => void registration.update(), UPDATE_CHECK_MS);
    },
  });

  if (!needRefresh) return null;
  return (
    <div
      className="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md animate-in flex-col gap-3 rounded-2xl bg-primary p-4 text-primary-foreground shadow-xl fade-in slide-in-from-bottom-4 md:bottom-6"
      role="status"
    >
      <p className="flex items-center gap-2 font-semibold">
        <Sparkles aria-hidden="true" className="size-5 text-spotlight" />
        {t('pwa.updateReady')}
      </p>
      <div className="flex gap-2">
        <Button variant="spotlight" size="sm" onClick={() => void updateServiceWorker(true)}>
          {t('pwa.updateNow')}
        </Button>
        <Button
          variant="quiet"
          size="sm"
          className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
          onClick={() => {
            setNeedRefresh(false);
          }}
        >
          {t('pwa.later')}
        </Button>
      </div>
    </div>
  );
}
