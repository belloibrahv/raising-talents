import { Globe, MapPin, PenLine } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { placeLabel } from '../../shared/places';
import { Avatar } from '../../shared/ui/Avatar';
import { buttonLink } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { PageSkeleton } from '../../shared/ui/PageSkeleton';
import { VerifiedBadge } from '../../shared/ui/VerifiedBadge';
import { RemoveMedia } from '../moderation/RemoveMedia';
import { RosterBadge, SaveAgentButton } from './AgentCard';
import { useAgent } from './queries';

/** The address without the scheme, as people say it. */
const shortAddress = (url: string) => url.replace(/^https:\/\//, '').replace(/\/$/, '');

/**
 * An agent's page as talent see it: the agency, who they look for, whether they are taking
 * people on, and what they say about themselves. Never an email or a phone number.
 */
export function AgentProfilePage() {
  const { id = '' } = useParams();
  const profile = useAgent(id);

  if (profile.isPending) return <PageSkeleton variant="profile" />;
  if (profile.isError) {
    return (
      <Page title={t('agents.notAvailable')}>
        {isApiError(profile.error, 'NOT_FOUND') ? (
          <p className="m-0 text-muted-foreground">{t('agents.notAvailableBody')}</p>
        ) : (
          <FormMessage tone="error">{errorMessage(profile.error)}</FormMessage>
        )}
        <Link to="/agents">{t('agents.browse')}</Link>
      </Page>
    );
  }

  const agent = profile.data;
  return (
    <Page
      title={agent.agencyName}
      documentTitle={t('titles.agentProfile', { name: agent.agencyName })}
      width="wide"
      className="[&>div]:max-w-3xl [&>div>header]:sr-only"
      hero={
        <section className="grid gap-5" aria-label={agent.agencyName}>
          <div className="flex items-center gap-5">
            <Avatar name={agent.agencyName} urls={agent.avatarUrls} size="xl" />
            <div className="grid min-w-0 flex-1 gap-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p
                  className="m-0 font-display text-2xl leading-tight font-bold sm:text-3xl"
                  aria-hidden="true"
                >
                  {agent.agencyName}
                </p>
                {agent.verified ? <VerifiedBadge label={t('agents.verified')} /> : null}
              </div>
              <p className="m-0 font-semibold">{agent.jobTitle}</p>
              <RosterBadge status={agent.rosterStatus} />
            </div>
          </div>
          <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-1 p-0 text-sm text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <MapPin aria-hidden="true" className="size-4" />
              {placeLabel(agent.city, 'long')}
            </li>
            {agent.website ? (
              <li className="inline-flex items-center gap-1.5">
                <Globe aria-hidden="true" className="size-4" />
                <a href={agent.website} target="_blank" rel="noreferrer nofollow">
                  {shortAddress(agent.website)}
                </a>
              </li>
            ) : null}
          </ul>
          <div className="flex flex-wrap items-start gap-2">
            {agent.isSelf ? (
              <Link className={buttonLink('secondary', 'sm')} to="/onboarding/agent">
                <PenLine aria-hidden="true" />
                {t('home.editProfile')}
              </Link>
            ) : (
              <SaveAgentButton id={agent.id} name={agent.agencyName} saved={agent.saved} />
            )}
          </div>
          {agent.isSelf && !agent.verified ? (
            <p className="m-0 rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
              {t('agents.notListedYet')}
            </p>
          ) : null}
          {agent.avatarMediaId && !agent.isSelf ? (
            <RemoveMedia mediaId={agent.avatarMediaId} what="photo" owner={agent.agencyName} />
          ) : null}
        </section>
      }
    >
      <section className="grid gap-3" aria-labelledby="agent-looking-for">
        <h2 id="agent-looking-for" className="text-lg font-bold">
          {t('agents.lookingForTitle')}
        </h2>
        <ul className="row m-0 list-none gap-2 p-0">
          {agent.specializations.map((entry) => (
            <li key={entry.slug}>
              <Badge variant="secondary" className="px-3 py-1 text-sm">
                {entry.name}
              </Badge>
            </li>
          ))}
        </ul>
      </section>
      <section className="grid gap-3" aria-labelledby="agent-about">
        <h2 id="agent-about" className="text-lg font-bold">
          {t('agents.about')}
        </h2>
        {agent.bio ? (
          <p className="m-0 max-w-2xl leading-relaxed whitespace-pre-line">{agent.bio}</p>
        ) : (
          <p className="m-0 text-muted-foreground">
            {t(agent.isSelf ? 'agents.noBioSelf' : 'agents.noBio')}
          </p>
        )}
      </section>
      {agent.isSelf ? null : (
        <p className="m-0 max-w-2xl rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
          {t(agent.rosterStatus === 'full' ? 'agents.howContactFull' : 'agents.howContact')}
        </p>
      )}
    </Page>
  );
}
