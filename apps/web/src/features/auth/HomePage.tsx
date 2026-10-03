import { Building2, Eye, Images, PenLine, Search } from 'lucide-react';
import { Navigate } from 'react-router';
import { t } from '../../i18n';
import { PageSkeleton } from '../../shared/ui/PageSkeleton';
import { Page } from '../../shared/ui/Page';
import { useMyAgentProfile, useMyTalentProfile } from '../profile/queries';
import { VerificationCard } from '../profile/VerificationCard';
import { useSession } from './use-auth';
import { ActionCard } from '../../shared/ui/ActionCard';

/** The signed-in start: finishes onboarding first, then a short dashboard for each role. */
export function HomePage() {
  const me = useSession().me;
  if (me?.status === 'onboarding') {
    return (
      <Navigate to={me.role === 'agent' ? '/onboarding/agent' : '/onboarding/talent'} replace />
    );
  }
  if (me?.role === 'moderator' || me?.role === 'admin')
    return <Navigate to="/moderation" replace />;
  return me?.role === 'agent' ? <AgentHome /> : <TalentHome />;
}

function TalentHome() {
  const profile = useMyTalentProfile();
  if (profile.isPending) return <PageSkeleton />;
  const data = profile.data;
  return (
    <Page
      title={t('home.talentReadyTitle', { name: data?.displayName ?? '' })}
      documentTitle={t('titles.home')}
      subtitle={t('home.talentReadyBody')}
    >
      <nav aria-label={t('titles.home')}>
        <ul className="m-0 grid list-none gap-3 p-0">
          <li>
            <ActionCard
              featured
              to="/portfolio"
              icon={Images}
              title={t('home.managePortfolio')}
              description={t('home.managePortfolioBody')}
            />
          </li>
          {data ? (
            <li>
              <ActionCard
                to={`/talents/${data.handle}`}
                icon={Eye}
                title={t('home.viewProfile')}
                description={t('home.viewProfileBody')}
              />
            </li>
          ) : null}
          <li>
            <ActionCard
              to="/onboarding/talent/about"
              icon={PenLine}
              title={t('home.editProfile')}
              description={t('home.editProfileBody')}
            />
          </li>
        </ul>
      </nav>
    </Page>
  );
}

function AgentHome() {
  const profile = useMyAgentProfile();
  if (profile.isPending) return <PageSkeleton />;
  const data = profile.data;
  return (
    <Page
      title={t('home.agentTitle', { name: data?.agencyName ?? '' })}
      documentTitle={t('titles.home')}
      subtitle={data?.verified ? t('home.agentVerified') : t('home.agentPending')}
    >
      <nav aria-label={t('titles.home')}>
        <ul className="m-0 grid list-none gap-3 p-0">
          <li>
            <ActionCard
              featured
              to="/search"
              icon={Search}
              title={t('home.findTalent')}
              description={t('home.findTalentBody')}
            />
          </li>
          <li>
            <ActionCard
              to="/onboarding/agent"
              icon={Building2}
              title={t('home.editProfile')}
              description={t('home.editAgencyBody')}
            />
          </li>
        </ul>
      </nav>
      <VerificationCard />
    </Page>
  );
}
