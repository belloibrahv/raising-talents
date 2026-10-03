import type { LucideIcon } from 'lucide-react';
import { Bookmark, House, Images, LogOut, Search, ShieldCheck, UserRound } from 'lucide-react';
import { NavLink, Outlet } from 'react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DeletionBanner } from '../features/account/DeletionBanner';
import { useSession, useSignOut } from '../features/auth/use-auth';
import { t } from '../i18n';
import { InstallCard } from '../shared/pwa/InstallCard';
import { BrandMark } from '../shared/ui/BrandMark';

interface Destination {
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
}

/**
 * Every signed-in screen. One navigation landmark: inline in the header on wide screens,
 * a bottom tab bar on phones where thumbs reach it.
 */
export function AppLayout() {
  const me = useSession().me;
  const signOut = useSignOut();
  const onboarding = me?.status === 'onboarding';
  const staff = me?.role === 'moderator' || me?.role === 'admin';
  const destinations: Destination[] = [
    ...(onboarding ? [] : [{ to: '/home', label: t('nav.home'), icon: House }]),
    ...(staff ? [{ to: '/moderation', label: t('nav.moderation'), icon: ShieldCheck }] : []),
    ...(me?.role === 'agent' && !onboarding
      ? [
          { to: '/search', label: t('nav.search'), icon: Search },
          { to: '/shortlist', label: t('nav.shortlist'), icon: Bookmark },
        ]
      : []),
    ...(me?.role === 'talent' && !onboarding
      ? [{ to: '/portfolio', label: t('nav.portfolio'), icon: Images }]
      : []),
    { to: '/account', label: t('nav.account'), icon: UserRound },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
          <NavLink
            to="/home"
            className="flex items-center gap-2.5 rounded-lg font-display text-lg font-bold no-underline"
          >
            <BrandMark />
            <span>{t('common.appName')}</span>
          </NavLink>
          <nav
            aria-label={t('nav.main')}
            className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:ml-auto md:border-0 md:bg-transparent md:pb-0"
          >
            <ul className="mx-auto flex max-w-md list-none justify-around p-0 md:max-w-none md:gap-1">
              {destinations.map(({ to, label, icon: Icon }) => (
                <li key={to} className="flex-1 md:flex-none">
                  <NavLink
                    to={to}
                    end={to === '/home'}
                    className={({ isActive }) =>
                      cn(
                        'flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-3 text-xs font-semibold text-muted-foreground no-underline transition-colors hover:text-foreground md:min-h-10 md:flex-row md:gap-2 md:rounded-full md:px-4 md:text-sm',
                        isActive && 'text-foreground md:bg-accent',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={cn(
                            'grid h-7 w-12 place-items-center rounded-full transition-colors md:h-auto md:w-auto',
                            isActive &&
                              'bg-spotlight text-spotlight-foreground md:bg-transparent md:text-current',
                          )}
                        >
                          <Icon aria-hidden="true" className="size-5 md:size-4" />
                        </span>
                        {label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto md:ml-0"
            onClick={() => {
              signOut.mutate();
            }}
          >
            <LogOut aria-hidden="true" />
            {t('nav.signOut')}
          </Button>
        </div>
      </header>
      <DeletionBanner />
      <Outlet />
      {onboarding ? null : (
        <aside className="mx-auto w-full max-w-xl px-4 pb-28 md:pb-10">
          <InstallCard />
        </aside>
      )}
    </div>
  );
}
