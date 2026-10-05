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
  MessageCircleHeart,
  MessageCircleX,
  MessageSquareText,
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
import { PageSkeleton } from '../../shared/ui/PageSkeleton';
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
    case 'contact_requested':
      return {
        icon: MessageSquareText,
        tone: 'neutral',
        title: t('notifications.contactRequested', { agency: notice.agencyName }),
        body: t('notifications.contactRequestedBody'),
        to: `/messages/${notice.conversationId}`,
      };
    case 'contact_accepted':
      return {
        icon: MessageCircleHeart,
        tone: 'good',
        title: t('notifications.contactAccepted', { name: notice.talentName }),
        body: t('notifications.contactAcceptedBody'),
        to: `/messages/${notice.conversationId}`,
      };
    case 'contact_declined':
      return {
        icon: MessageCircleX,
        tone: 'neutral',
        title: t('notifications.contactDeclined', { name: notice.talentName }),
        body: t('notifications.contactDeclinedBody'),
        to: '/search',
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

  if (notifications.isPending) return <PageSkeleton />;
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
      {(
        [
          { key: 'new', title: t('notifications.groupNew'), items: items.filter((n) => !n.read) },
          {
            key: 'earlier',
            title: t('notifications.groupEarlier'),
            items: items.filter((n) => n.read),
          },
        ] as const
      ).map((group) =>
        group.items.length === 0 ? null : (
          <section key={group.key} className="stack gap-2" aria-labelledby={`group-${group.key}`}>
            <h2
              id={`group-${group.key}`}
              className="text-xs font-bold tracking-wider text-muted-foreground uppercase"
            >
              {group.title}
            </h2>
            <ul className="m-0 list-none divide-y overflow-hidden rounded-2xl border bg-card p-0 shadow-xs">
              {group.items.map((notice) => {
                const shown = show(notice);
                const Icon = shown.icon;
                return (
                  <li key={notice.id}>
                    <Link
                      to={shown.to}
                      className={cn(
                        'group flex items-start gap-3 p-4 text-card-foreground no-underline transition-colors hover:bg-accent/60 sm:px-5',
                        notice.read ? null : 'bg-spotlight/10',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-10 shrink-0 place-items-center rounded-full',
                          TONE[shown.tone],
                        )}
                      >
                        <Icon aria-hidden="true" className="size-5" />
                      </span>
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span
                          className={cn(
                            'flex items-start gap-2',
                            notice.read ? 'font-medium' : 'font-bold',
                          )}
                        >
                          {notice.read ? null : (
                            <span className="sr-only">{`${t('notifications.unread')} `}</span>
                          )}
                          {shown.title}
                        </span>
                        <span className="text-sm text-muted-foreground">{shown.body}</span>
                        <span className="text-xs text-muted-foreground">
                          {ago(notice.createdAt)}
                        </span>
                      </span>
                      {notice.read ? (
                        <ChevronRight
                          aria-hidden="true"
                          className="mt-2 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="mt-2 size-2.5 shrink-0 rounded-full bg-destructive"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ),
      )}
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
