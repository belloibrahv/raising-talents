import { Link, Navigate } from 'react-router';
import { t } from '../../i18n';
import { FullScreenStatus } from '../../shared/ui/FullScreenStatus';
import { Page } from '../../shared/ui/Page';
import { useMyAgentProfile, useMyTalentProfile } from '../profile/queries';
import { useSession } from './use-auth';

/** The signed-in start: finishes onboarding first, then a short dashboard for each role. */
export function HomePage() {
  const me = useSession().me;
  if (me?.status === 'onboarding') {
    return (
      <Navigate to={me.role === 'agent' ? '/onboarding/agent' : '/onboarding/talent'} replace />
    );
  }
  return me?.role === 'agent' ? <AgentHome /> : <TalentHome />;
}

function TalentHome() {
  const profile = useMyTalentProfile();
  if (profile.isPending) return <FullScreenStatus />;
  const data = profile.data;
  return (
    <Page
      title={t('home.talentReadyTitle', { name: data?.displayName ?? '' })}
      documentTitle={t('titles.home')}
      subtitle={t('home.talentReadyBody')}
    >
      <nav className="stack" aria-label={t('titles.home')}>
        <Link className="button button--primary" to="/portfolio">
          {t('home.managePortfolio')}
        </Link>
        {data ? (
          <Link className="button button--secondary" to={`/talents/${data.handle}`}>
            {t('home.viewProfile')}
          </Link>
        ) : null}
        <Link className="button button--text" to="/onboarding/talent/about">
          {t('home.editProfile')}
        </Link>
      </nav>
    </Page>
  );
}

function AgentHome() {
  const profile = useMyAgentProfile();
  if (profile.isPending) return <FullScreenStatus />;
  const data = profile.data;
  return (
    <Page
      title={t('home.agentTitle', { name: data?.agencyName ?? '' })}
      documentTitle={t('titles.home')}
      subtitle={data?.verified ? t('home.agentVerified') : t('home.agentPending')}
    >
      <p>{t('home.agentSearchSoon')}</p>
      <Link className="button button--primary" to="/search">
        {t('home.findTalent')}
      </Link>
      <Link className="button button--secondary" to="/onboarding/agent">
        {t('home.editProfile')}
      </Link>
    </Page>
  );
}
