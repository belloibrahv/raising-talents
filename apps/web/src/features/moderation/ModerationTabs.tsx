import { Flag, Images, ShieldCheck } from 'lucide-react';
import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';

const TABS = [
  { to: '/moderation', label: 'moderation.mediaTab', icon: Images },
  { to: '/moderation/agents', label: 'moderation.agentsTab', icon: ShieldCheck },
  { to: '/moderation/reports', label: 'moderation.reportsTab', icon: Flag },
] as const;

/** Switches between the queues. Links in shadcn's tab style, so each queue has its own address. */
export function ModerationTabs() {
  return (
    <nav aria-label={t('moderation.tabs')}>
      <ul className="inline-flex list-none gap-1 rounded-full bg-muted p-1">
        {TABS.map(({ to, label, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              end
              className={({ isActive }) =>
                cn(
                  'inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-muted-foreground no-underline transition-colors hover:text-foreground',
                  isActive && 'bg-background text-foreground shadow-sm',
                )
              }
            >
              <Icon aria-hidden="true" className="size-4" />
              {t(label)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
