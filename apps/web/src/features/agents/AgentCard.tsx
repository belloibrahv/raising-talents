import type { AgentCard as AgentCardView, RosterStatus } from '@rt/contracts';
import {
  BadgeCheck,
  Bookmark,
  BookmarkCheck,
  CircleCheck,
  CircleSlash,
  MapPin,
} from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { placeLabel } from '../../shared/places';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { useSession } from '../auth/use-auth';
import { useSaveAgent } from './queries';

/** "Open for submissions" or "Roster full". Nothing when the agent has not said. */
export function RosterBadge({ status }: { readonly status: RosterStatus | null }) {
  if (!status) return null;
  const Icon = status === 'open' ? CircleCheck : CircleSlash;
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        status === 'open' ? 'bg-success-surface text-success' : 'bg-muted text-muted-foreground',
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {t(`agents.roster.${status}`)}
    </span>
  );
}

/** The bookmark talent use to keep an agent for later. Other roles do not see it. */
export function SaveAgentButton({
  id,
  name,
  saved,
  compact = false,
}: {
  readonly id: string;
  readonly name: string;
  readonly saved: boolean;
  readonly compact?: boolean;
}) {
  const role = useSession().me?.role;
  const save = useSaveAgent();
  if (role !== 'talent') return null;
  const Icon = saved ? BookmarkCheck : Bookmark;
  const label = t(saved ? 'agents.savedNamed' : 'agents.saveNamed', { name });
  const toggle = () => {
    save.mutate({ id, save: !saved });
  };
  if (compact) {
    return (
      <button
        type="button"
        aria-pressed={saved}
        aria-label={label}
        className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full transition-colors hover:bg-accent active:scale-90"
        onClick={toggle}
      >
        <Icon
          aria-hidden="true"
          className={cn('size-5', saved && 'fill-primary/15 text-primary')}
        />
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant={saved ? 'secondary' : 'primary'}
        size="sm"
        aria-pressed={saved}
        aria-label={label}
        onClick={toggle}
      >
        <Icon aria-hidden="true" />
        {t(saved ? 'agents.saved' : 'agents.save')}
      </Button>
      {save.error ? (
        <p role="alert" className="m-0 text-sm text-destructive">
          {errorMessage(save.error)}
        </p>
      ) : null}
    </div>
  );
}

/** One agent in a list: who they are, where, who they look for, and whether they are open. */
export function AgentCard({ agent }: { readonly agent: AgentCardView }) {
  const page = `/agents/${agent.id}`;
  return (
    <article
      className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-4 text-card-foreground shadow-xs"
      aria-label={agent.agencyName}
    >
      <div className="flex items-start gap-3">
        <Link to={page} tabIndex={-1} aria-hidden="true" className="rounded-full">
          <Avatar name={agent.agencyName} urls={agent.avatarUrls} size="lg" />
        </Link>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <Link
            to={page}
            className="flex items-center gap-1.5 font-semibold text-foreground no-underline hover:underline"
          >
            <span className="truncate">{agent.agencyName}</span>
            {agent.verified ? (
              <>
                <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
                <span className="sr-only">{`, ${t('agents.verified')}`}</span>
              </>
            ) : null}
          </Link>
          <span className="truncate text-sm text-muted-foreground">{agent.jobTitle}</span>
          <span className="inline-flex items-center gap-1 truncate text-sm text-muted-foreground">
            <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
            {placeLabel(agent.city)}
          </span>
        </div>
        <SaveAgentButton id={agent.id} name={agent.agencyName} saved={agent.saved} compact />
      </div>
      <p className="m-0 text-sm">
        <span className="text-muted-foreground">{`${t('agents.lookingFor')} `}</span>
        {agent.specializations.map((entry) => entry.name).join(', ')}
      </p>
      <div className="mt-auto">
        <RosterBadge status={agent.rosterStatus} />
      </div>
    </article>
  );
}
