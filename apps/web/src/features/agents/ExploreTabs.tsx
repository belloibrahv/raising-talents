import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { useSession } from '../auth/use-auth';

/**
 * Explore has two sides: talent, and the verified agents who represent them. Agents search
 * talent from their own tab, so they are not shown the switch.
 */
export function ExploreTabs({ current }: { readonly current: 'talent' | 'agents' }) {
  const role = useSession().me?.role;
  if (role === 'agent') return null;
  const tabs = [
    { key: 'talent', to: '/search', label: t('agents.tabs.talent') },
    { key: 'agents', to: '/agents', label: t('agents.tabs.agents') },
  ] as const;
  return (
    <nav
      aria-label={t('agents.tabs.label')}
      className="grid w-full max-w-sm grid-cols-2 rounded-full bg-muted p-1"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          to={tab.to}
          aria-current={tab.key === current ? 'page' : undefined}
          className={cn(
            'flex h-10 items-center justify-center rounded-full text-sm font-semibold no-underline transition-colors',
            tab.key === current
              ? 'bg-background text-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
