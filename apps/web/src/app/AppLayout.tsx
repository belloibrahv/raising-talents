import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeft,
  Bookmark,
  Check,
  House,
  LogOut,
  MessagesSquare,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Suspense, type CSSProperties } from 'react';
import { NavLink, Outlet, useLocation, useMatch, useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { DeletionBanner } from '../features/account/DeletionBanner';
import { VerifyEmailBanner } from '../features/auth/VerifyEmailBanner';
import { useSession, useSignOut } from '../features/auth/use-auth';
import { t } from '../i18n';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { useMessagingUnread } from '../features/messages/queries';
import { useMyTalentProfile } from '../features/profile/queries';
import { useLiveUpdates } from '../shared/realtime/live-updates';
import { InstallCard } from '../shared/pwa/InstallCard';
import { BrandLockup, BrandMark } from '../shared/ui/BrandMark';
import { useMyVerification } from '../features/profile/verification-queries';
import { PageSkeleton } from '../shared/ui/PageSkeleton';
import { useTyping } from '../shared/ui/use-typing';

interface Destination {
  readonly to: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** The one marigold action in the bar: posting, for talent. */
  readonly primary?: boolean;
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
  // A talent's last tab is their own page, as on every social app; settings sit in the header.
  const talent = me?.role === 'talent' && !onboarding;
  const handle = useMyTalentProfile(talent).data?.handle;
  const destinations: Destination[] = [
    ...(onboarding ? [] : [{ to: '/home', label: t('nav.home'), icon: House }]),
    ...(staff
      ? [
          { to: '/moderation', label: t('nav.moderation'), icon: ShieldCheck },
          // Posts go live without a check first, so moderators browse like anyone else (ADR-048).
          { to: '/search', label: t('nav.discover'), icon: Search },
        ]
      : []),
    ...(me?.role === 'agent' && !onboarding
      ? [
          { to: '/search', label: t('nav.discover'), icon: Search },
          { to: '/shortlist', label: t('nav.shortlist'), icon: Bookmark },
        ]
      : []),
    ...(talent
      ? [
          { to: '/search', label: t('nav.discover'), icon: Search },
          { to: '/portfolio', label: t('nav.post'), icon: Plus, primary: true },
        ]
      : []),
    ...(talks ? [{ to: '/messages', label: t('nav.messages'), icon: MessagesSquare }] : []),
    talent
      ? // /me finds the handle, so the tab is there before the profile has loaded.
        { to: handle ? `/talents/${handle}` : '/me', label: t('nav.profile'), icon: UserRound }
      : { to: '/account', label: t('nav.account'), icon: UserRound },
  ];
  const accountInHeader = destinations.every((entry) => entry.to !== '/account');
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // An installed app has no browser bar, so a screen that is not a tab needs its own way back.
  const deep = !onboarding && destinations.every((entry) => entry.to !== pathname);
  const inChat = useMatch('/messages/:conversationId') !== null;
  const typing = useTyping();
  // A chat keeps the bottom of a phone for its message bar; so does the keyboard, for any form.
  const tabsAway = inChat || typing;
  const goBack = () => {
    const steps = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    // Opened from a link or a notification, there is nothing behind: go up a level instead.
    if (steps > 0) void navigate(-1);
    else void navigate(inChat ? '/messages' : '/home', { replace: true });
  };
  const sidebar = !onboarding;
  return (
    <div
      className={cn('flex min-h-dvh flex-col', sidebar && 'md:pl-64')}
      // How far a bar stuck to the bottom of a phone must sit above the edge to clear the tabs.
      style={{ '--tabs-clear': onboarding || tabsAway ? '0.75rem' : '5.25rem' } as CSSProperties}
    >
      <header className="sticky top-0 z-30 border-b bg-background pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-2 pr-[max(0.5rem,env(safe-area-inset-right))] pl-[max(1rem,env(safe-area-inset-left))] sm:px-6 md:h-16 md:gap-4">
          {deep ? (
            <button
              type="button"
              aria-label={t('nav.back')}
              className="-ml-2 grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-foreground hover:bg-accent active:bg-accent md:hidden"
              onClick={goBack}
            >
              <ArrowLeft aria-hidden="true" className="size-5" />
            </button>
          ) : null}
          <NavLink
            to="/home"
            // On wide screens the name is at the top of the sidebar instead.
            className={cn(
              'flex min-h-11 min-w-0 items-center gap-[0.45em] rounded-lg font-display text-xl font-bold tracking-[-0.01em] no-underline',
              sidebar && 'md:hidden',
            )}
          >
            {/* On a phone the back arrow takes the mark's place, so the name still fits. */}
            <BrandMark className={cn('size-[1.4em]', deep && 'max-md:hidden')} />
            <span className="truncate">{t('common.appName')}</span>
          </NavLink>
          {onboarding ? (
            // Setting up is one focused flow: no tabs, just a way to the account.
            <nav aria-label={t('nav.main')} className="ml-auto">
              <NavLink
                to="/account"
                className="rounded-full px-3 py-2 text-sm font-semibold text-muted-foreground no-underline hover:bg-accent hover:text-foreground"
              >
                {t('nav.account')}
              </NavLink>
            </nav>
          ) : (
            <MainNav
              destinations={destinations}
              hidden={tabsAway}
              unverifiedEmail={me ? !me.emailVerified : false}
              waiting={waiting}
              agent={me?.role === 'agent'}
            />
          )}
          <div className="ml-auto flex shrink-0 items-center md:gap-1">
            <NotificationBell />
            {accountInHeader ? (
              <NavLink
                to="/account"
                // The label carries the dot's meaning: an aria-label replaces the content inside.
                aria-label={
                  me && !me.emailVerified
                    ? `${t('nav.account')}, ${t('verifyBanner.dot')}`
                    : t('nav.account')
                }
                className={({ isActive }) =>
                  cn(
                    'relative grid size-11 place-items-center rounded-full text-foreground hover:bg-accent md:size-10',
                    isActive && 'bg-accent',
                  )
                }
              >
                <Settings aria-hidden="true" className="size-5" strokeWidth={1.75} />
                {me && !me.emailVerified ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-ember ring-2 ring-background"
                  />
                ) : null}
              </NavLink>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              // On a phone signing out lives on the account screen, away from a stray thumb.
              className={onboarding ? undefined : 'max-sm:hidden'}
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

/**
 * The one navigation landmark (brand guide, UI design): a bottom bar on phones, where thumbs
 * reach it, with posting as the marigold button in the middle; the stage as a sidebar on wider
 * screens. Unread counts are ember, the colour of energy, never an error.
 */
function MainNav({
  destinations,
  hidden,
  unverifiedEmail,
  waiting,
  agent,
}: {
  readonly destinations: readonly Destination[];
  readonly hidden: boolean;
  readonly unverifiedEmail: boolean;
  readonly waiting: number;
  readonly agent: boolean;
}) {
  const verified = useMyVerification(agent).data?.state === 'verified';
  return (
    <nav
      aria-label={t('nav.main')}
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t bg-card pb-[env(safe-area-inset-bottom)]',
        'md:top-0 md:right-auto md:w-64 md:flex-col md:border-t-0 md:bg-stage md:p-4 md:text-stage-ink',
        hidden ? 'max-md:hidden' : null,
        'md:flex',
      )}
    >
      <NavLink
        to="/home"
        className="mb-6 hidden min-h-11 items-center px-2 text-xl text-stage-ink no-underline md:flex"
      >
        <BrandLockup version="spotlight" />
      </NavLink>
      <ul className="m-0 flex list-none items-stretch justify-around p-0 md:flex-col md:gap-1">
        {destinations.map(({ to, label, icon: Icon, primary }) => (
          <li key={to} className="flex-1 md:flex-none">
            <NavLink
              to={to}
              end={to === '/home'}
              className={({ isActive }) =>
                cn(
                  'group flex min-h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-semibold text-muted-foreground no-underline transition-colors hover:text-foreground',
                  'md:min-h-11 md:flex-row md:justify-start md:gap-3 md:rounded-md md:px-3 md:text-base md:font-medium md:text-stage-ink-muted md:hover:bg-stage-ink/5 md:hover:text-stage-ink',
                  isActive &&
                    'font-bold text-foreground md:bg-stage-ink/10 md:font-semibold md:text-spotlight md:hover:text-spotlight',
                )
              }
            >
              <span
                className={cn(
                  'relative grid place-items-center',
                  // Posting is the marigold button in the middle of the bar on a phone.
                  primary &&
                    'size-12 rounded-[14px] bg-spotlight text-spotlight-ink md:size-auto md:rounded-none md:bg-transparent md:text-current',
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={cn('size-6 md:size-5', primary && 'max-md:size-6')}
                  strokeWidth={1.75}
                />
                {to === '/account' && unverifiedEmail ? (
                  <span
                    aria-hidden="true"
                    className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-ember ring-2 ring-card md:ring-stage"
                  />
                ) : null}
                {to === '/messages' && waiting > 0 ? (
                  <span
                    aria-hidden="true"
                    className="absolute -top-1.5 -right-2.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-ember-text px-1 text-[10px] leading-none font-bold text-ember-ink ring-2 ring-card md:hidden"
                  >
                    {waiting > 9 ? '9+' : waiting}
                  </span>
                ) : null}
              </span>
              <span className={cn('md:flex-1', primary && 'max-md:sr-only')}>{label}</span>
              {to === '/messages' && waiting > 0 ? (
                <span
                  aria-hidden="true"
                  className="hidden min-w-6 rounded-full bg-ember-text px-1.5 text-center text-xs font-bold text-ember-ink md:inline"
                >
                  {waiting > 9 ? '9+' : waiting}
                </span>
              ) : null}
              {to === '/account' && unverifiedEmail ? (
                <span className="sr-only">{`, ${t('verifyBanner.dot')}`}</span>
              ) : null}
              {to === '/messages' && waiting > 0 ? (
                <span className="sr-only">{`, ${t('nav.messagesUnread', { count: waiting })}`}</span>
              ) : null}
            </NavLink>
          </li>
        ))}
      </ul>
      {verified ? (
        <p className="mt-auto mb-0 hidden items-center gap-2 rounded-md bg-stage-verified/15 p-3 text-sm font-semibold text-stage-verified md:flex">
          <Check aria-hidden="true" className="size-4" />
          {t('nav.verifiedAgency')}
        </p>
      ) : null}
    </nav>
  );
}
