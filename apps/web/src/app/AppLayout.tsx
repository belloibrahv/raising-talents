import type { LucideIcon } from 'lucide-react';
import {
  Bookmark,
  House,
  Images,
  LogOut,
  MessagesSquare,
  Search,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Suspense } from 'react';
import { NavLink, Outlet, useMatch } from 'react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DeletionBanner } from '../features/account/DeletionBanner';
import { VerifyEmailBanner } from '../features/auth/VerifyEmailBanner';
import { useSession, useSignOut } from '../features/auth/use-auth';
import { t } from '../i18n';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { useMessagingUnread } from '../features/messages/queries';
import { useLiveUpdates } from '../shared/realtime/live-updates';
import { InstallCard } from '../shared/pwa/InstallCard';
import { BrandMark } from '../shared/ui/BrandMark';
import { PageSkeleton } from '../shared/ui/PageSkeleton';

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
  const talks = (me?.role === 'agent' || me?.role === 'talent') && !onboarding;
  const waiting = useMessagingUnread(talks).data?.unread ?? 0;
  useLiveUpdates(me !== null);
  // A chat keeps the bottom of the screen for its message bar.
  // The install offer lives on the home screen only, so it never crowds a task.
  const onHome = useMatch('/home') !== null;
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
    ...(talks ? [{ to: '/messages', label: t('nav.messages'), icon: MessagesSquare }] : []),
    { to: '/account', label: t('nav.account'), icon: UserRound },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-4 px-4 sm:px-6">
          <NavLink
            to="/home"
            className="flex min-w-0 items-center gap-2.5 rounded-lg font-display text-lg font-bold whitespace-nowrap no-underline"
          >
            <BrandMark />
            <span>{t('common.appName')}</span>
          </NavLink>
          {onboarding ? (
            // Setting up is one focused flow: no tab bar, just a way to the account.
            <nav aria-label={t('nav.main')} className="ml-auto">
              <NavLink
                to="/account"
                className="rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground no-underline hover:bg-accent hover:text-foreground"
              >
                {t('nav.account')}
              </NavLink>
            </nav>
          ) : (
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
                              'relative grid h-7 w-12 place-items-center rounded-full transition-colors md:h-auto md:w-auto',
                              isActive &&
                                'bg-spotlight text-spotlight-foreground md:bg-transparent md:text-current',
                            )}
                          >
                            <Icon aria-hidden="true" className="size-5 md:size-4" />
                            {to === '/account' && me && !me.emailVerified ? (
                              <span
                                aria-hidden="true"
                                className="absolute top-0.5 right-2.5 size-2.5 rounded-full bg-destructive ring-2 ring-background md:-top-0.5 md:-right-1"
                              />
                            ) : null}
                            {to === '/messages' && waiting > 0 ? (
                              <span
                                aria-hidden="true"
                                className="absolute -top-1 right-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-destructive px-1 text-[10px] leading-none font-bold text-destructive-foreground ring-2 ring-background md:-top-2 md:-right-3"
                              >
                                {waiting > 9 ? '9+' : waiting}
                              </span>
                            ) : null}
                          </span>
                          {label}
                          {to === '/account' && me && !me.emailVerified ? (
                            <span className="sr-only">{`, ${t('verifyBanner.dot')}`}</span>
                          ) : null}
                          {to === '/messages' && waiting > 0 ? (
                            <span className="sr-only">{`, ${t('nav.messagesUnread', { count: waiting })}`}</span>
                          ) : null}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          )}
          <div className="ml-auto flex items-center gap-1 md:ml-0">
            <NotificationBell />
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('nav.signOut')}
              onClick={() => {
                signOut.mutate();
              }}
            >
              <LogOut aria-hidden="true" />
              {/* An icon on phones, where the header has little room. */}
              <span className="hidden sm:inline">{t('nav.signOut')}</span>
            </Button>
          </div>
        </div>
      </header>
      <DeletionBanner />
      <VerifyEmailBanner />
      {/* Screens load their code on demand; the header and tabs stay while they do. */}
      <Suspense fallback={<PageSkeleton />}>
        <Outlet />
      </Suspense>
      {onboarding || !onHome ? null : (
        <aside className="mx-auto w-full max-w-xl px-4 pb-28 md:pb-10">
          <InstallCard />
        </aside>
      )}
    </div>
  );
}
