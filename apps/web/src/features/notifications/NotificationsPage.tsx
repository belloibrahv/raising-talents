import type { Notification } from '@rt/contracts';
import {
  BadgeCheck,
  BadgeX,
  Bell,
  CalendarClock,
  ChevronRight,
  ImageOff,
  Images,
  KeyRound,
  Mail,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { Button } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { FormMessage } from '../../shared/ui/FormMessage';
import { FullScreenStatus } from '../../shared/ui/FullScreenStatus';
import { Page } from '../../shared/ui/Page';
import { useMarkAllRead, useNotifications } from './queries';

interface Shown {
  readonly icon: LucideIcon;
  readonly tone: 'good' | 'bad' | 'neutral';
  readonly title: string;
  readonly body: string;
  readonly to: string;
}

const fileName = (notice: { mediaKind: 'image' | 'video'; purpose: 'avatar' | 'portfolio' }) =>
  notice.purpose === 'avatar'
    ? t('notifications.file.avatar')
    : notice.mediaKind === 'video'
      ? t('notifications.file.video')
      : t('notifications.file.photo');

const longDate = new Intl.DateTimeFormat('en-NG', { dateStyle: 'long' });

/** Every kind has its words here, so stored notices never carry copy. */
function show(notice: Notification): Shown {
  switch (notice.kind) {
    case 'media_approved':
      return {
        icon: Images,
        tone: 'good',
        title: t('notifications.mediaApproved', { file: fileName(notice) }),
        body: t('notifications.mediaApprovedBody'),
        to: notice.purpose === 'avatar' ? '/home' : '/portfolio',
      };
    case 'media_rejected':
      return {
        icon: ImageOff,
        tone: 'bad',
        title: t('notifications.mediaRejected', { file: fileName(notice) }),
        body: notice.reason,
        to: '/portfolio',
      };
    case 'agent_verified':
      return {
        icon: BadgeCheck,
        tone: 'good',
        title: t('notifications.agentVerified'),
        body: t('notifications.agentVerifiedBody'),
        to: '/home',
      };
    case 'agent_declined':
      return {
        icon: BadgeX,
        tone: 'bad',
        title: t('notifications.agentDeclined'),
        body: notice.reason,
        to: '/verification',
      };
    case 'deletion_scheduled':
      return {
        icon: CalendarClock,
        tone: 'bad',
        title: t('notifications.deletionScheduled', {
          date: longDate.format(new Date(notice.scheduledFor)),
        }),
        body: t('notifications.deletionScheduledBody'),
        to: '/account',
      };
    case 'account_reinstated':
      return {
        icon: UserCheck,
        tone: 'good',
        title: t('notifications.reinstated'),
        body: t('notifications.reinstatedBody'),
        to: '/home',
      };
    case 'email_changed':
      return {
        icon: Mail,
        tone: 'neutral',
        title: t('notifications.emailChanged'),
        body: t('notifications.emailChangedBody'),
        to: '/account',
      };
    case 'password_changed':
      return {
        icon: KeyRound,
        tone: 'neutral',
        title: t('notifications.passwordChanged'),
        body: t('notifications.passwordChangedBody'),
        to: '/account',
      };
  }
}

const relative = new Intl.RelativeTimeFormat('en-NG', { numeric: 'auto' });

function ago(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return t('notifications.justNow');
}

const TONE = {
  good: 'bg-success-surface text-success',
  bad: 'bg-destructive-surface text-destructive',
  neutral: 'bg-muted text-foreground',
} as const;

export function NotificationsPage() {
  const notifications = useNotifications();
  const markRead = useMarkAllRead();
  const marked = useRef(false);
  const unread = notifications.data?.pages[0]?.unread ?? 0;

  // Opening the inbox reads it. The list keeps its unread dots until the next visit.
  useEffect(() => {
    if (unread > 0 && !marked.current) {
      marked.current = true;
      markRead.mutate();
    }
  }, [unread, markRead]);

  if (notifications.isPending) return <FullScreenStatus />;
  const items = notifications.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Page title={t('notifications.title')} documentTitle={t('titles.notifications')}>
      <FormMessage tone="error">
        {notifications.error ? errorMessage(notifications.error) : null}
      </FormMessage>
      {items.length === 0 && !notifications.error ? (
        <EmptyState
          icon={Bell}
          title={t('notifications.empty')}
          description={t('notifications.emptyBody')}
        />
      ) : null}
      <ul className="m-0 grid list-none gap-2 p-0">
        {items.map((notice) => {
          const shown = show(notice);
          const Icon = shown.icon;
          return (
            <li key={notice.id}>
              <Link
                to={shown.to}
                className={cn(
                  'group flex items-start gap-3 rounded-2xl border p-4 text-card-foreground no-underline transition-colors hover:border-input',
                  notice.read ? 'bg-card' : 'border-primary/30 bg-accent/60',
                )}
              >
                <span
                  className={cn(
                    'grid size-10 shrink-0 place-items-center rounded-xl',
                    TONE[shown.tone],
                  )}
                >
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="flex items-start gap-2 font-semibold">
                    {notice.read ? null : (
                      <>
                        <span
                          aria-hidden="true"
                          className="mt-2 size-2 shrink-0 rounded-full bg-destructive"
                        />
                        <span className="sr-only">{`${t('notifications.unread')} `}</span>
                      </>
                    )}
                    {shown.title}
                  </span>
                  <span className="text-sm text-muted-foreground">{shown.body}</span>
                  <span className="text-xs text-muted-foreground">{ago(notice.createdAt)}</span>
                </span>
                <ChevronRight
                  aria-hidden="true"
                  className="mt-2 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          );
        })}
      </ul>
      {notifications.hasNextPage ? (
        <Button
          variant="secondary"
          loading={notifications.isFetchingNextPage}
          onClick={() => void notifications.fetchNextPage()}
        >
          {t('notifications.loadMore')}
        </Button>
      ) : null}
    </Page>
  );
}
