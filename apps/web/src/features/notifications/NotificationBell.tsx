import { Bell } from 'lucide-react';
import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { useUnreadCount } from './queries';

/** The header bell. The count is part of its name, so screen readers hear it too. */
export function NotificationBell() {
  const unread = useUnreadCount(true).data?.unread ?? 0;
  const label =
    unread === 0 ? t('notifications.bell') : t('notifications.bellUnread', { count: unread });
  return (
    <NavLink
      to="/notifications"
      aria-label={label}
      className={({ isActive }) =>
        cn(
          'relative grid size-10 place-items-center rounded-full text-foreground no-underline transition-colors hover:bg-accent',
          isActive && 'bg-accent',
        )
      }
    >
      <Bell aria-hidden="true" className="size-5" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground ring-2 ring-background"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      ) : null}
    </NavLink>
  );
}
