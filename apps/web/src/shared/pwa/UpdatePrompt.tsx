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
    <div className="toast" role="status">
      <p>{t('pwa.updateReady')}</p>
      <div className="toast__actions">
        <Button onClick={() => void updateServiceWorker(true)}>{t('pwa.updateNow')}</Button>
        <Button
          variant="text"
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
