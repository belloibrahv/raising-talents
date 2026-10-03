import { NavLink, Outlet } from 'react-router';
import { DeletionBanner } from '../features/account/DeletionBanner';
import { useSession, useSignOut } from '../features/auth/use-auth';
import { t } from '../i18n';
import { InstallCard } from '../shared/pwa/InstallCard';

/** Every signed-in screen: the brand, the main navigation and sign out. */
export function AppLayout() {
  const me = useSession().me;
  const signOut = useSignOut();
  const onboarding = me?.status === 'onboarding';
  return (
    <>
      <header className="app-header">
        <NavLink className="app-header__brand" to="/home">
          {t('common.appName')}
        </NavLink>
        <nav aria-label={t('nav.main')}>
          <ul>
            {onboarding ? null : (
              <li>
                <NavLink to="/home">{t('nav.home')}</NavLink>
              </li>
            )}
            {me?.role === 'moderator' || me?.role === 'admin' ? (
              <li>
                <NavLink to="/moderation">{t('nav.moderation')}</NavLink>
              </li>
            ) : null}
            {me?.role === 'agent' && !onboarding ? (
              <li>
                <NavLink to="/search">{t('nav.search')}</NavLink>
              </li>
            ) : null}
            {me?.role === 'talent' && !onboarding ? (
              <li>
                <NavLink to="/portfolio">{t('nav.portfolio')}</NavLink>
              </li>
            ) : null}
            <li>
              <NavLink to="/account">{t('nav.account')}</NavLink>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  signOut.mutate();
                }}
              >
                {t('nav.signOut')}
              </button>
            </li>
          </ul>
        </nav>
      </header>
      <DeletionBanner />
      <Outlet />
      {onboarding ? null : (
        <aside className="install-slot">
          <InstallCard />
        </aside>
      )}
    </>
  );
}
