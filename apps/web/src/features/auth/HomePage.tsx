import { t } from '../../i18n';
import { InstallCard } from '../../shared/pwa/InstallCard';
import { Button } from '../../shared/ui/Button';
import { Page } from '../../shared/ui/Page';
import { useSession, useSignOut } from './use-auth';

/** The signed-in start screen. Onboarding (profile, photo, portfolio) replaces it in the next change. */
export function HomePage() {
  const me = useSession().me;
  const signOut = useSignOut();
  const isTalent = me?.role === 'talent';
  return (
    <Page
      title={isTalent ? t('home.titleTalent') : t('home.titleAgent')}
      documentTitle={t('titles.home')}
      subtitle={isTalent ? t('home.bodyTalent') : t('home.bodyAgent')}
    >
      <InstallCard />
      <p className="page__subtitle">{t('home.signedInAs', { email: me?.email ?? '' })}</p>
      <Button
        variant="secondary"
        onClick={() => {
          signOut.mutate();
        }}
        loading={signOut.isPending}
      >
        {t('home.signOut')}
      </Button>
    </Page>
  );
}
