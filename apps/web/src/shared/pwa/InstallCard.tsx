import { t } from '../../i18n';
import { Button } from '../ui/Button';
import { useInstallOffer } from './install';

/** A quiet card, shown after sign-in, that offers to put the app on the home screen. */
export function InstallCard() {
  const offer = useInstallOffer();
  if (offer.kind === 'none') return null;
  return (
    <section className="install-card" aria-labelledby="install-title">
      <h2 id="install-title">{t('pwa.install')}</h2>
      <p>{offer.kind === 'ios' ? t('pwa.installIos') : t('pwa.installBody')}</p>
      <div className="toast__actions">
        {offer.kind === 'prompt' ? (
          <Button onClick={() => void offer.install()}>{t('pwa.install')}</Button>
        ) : null}
        <Button variant="text" onClick={offer.dismiss}>
          {t('pwa.dismiss')}
        </Button>
      </div>
    </section>
  );
}
