import { Download } from 'lucide-react';
import { t } from '../../i18n';
import { BrandMark } from '../ui/BrandMark';
import { Button } from '../ui/Button';
import { useInstallOffer } from './install';

/** A quiet card, shown after sign-in, that offers to put the app on the home screen. */
export function InstallCard() {
  const offer = useInstallOffer();
  if (offer.kind === 'none') return null;
  return (
    <section
      className="flex gap-4 rounded-2xl border bg-card p-5 shadow-sm"
      aria-labelledby="install-title"
    >
      <BrandMark className="size-12" />
      <div className="grid flex-1 gap-1">
        <h2 id="install-title" className="text-lg font-semibold">
          {t('pwa.install')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {offer.kind === 'ios' ? t('pwa.installIos') : t('pwa.installBody')}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {offer.kind === 'prompt' ? (
            <Button size="sm" onClick={() => void offer.install()}>
              <Download aria-hidden="true" />
              {t('pwa.install')}
            </Button>
          ) : null}
          <Button variant="quiet" size="sm" onClick={offer.dismiss}>
            {t('pwa.dismiss')}
          </Button>
        </div>
      </div>
    </section>
  );
}
