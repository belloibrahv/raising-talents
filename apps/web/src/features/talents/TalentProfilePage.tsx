import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { api } from '../../shared/api/client';
import { VideoPlayer } from '../../shared/media/VideoPlayer';
import { FormMessage } from '../../shared/ui/FormMessage';
import { FullScreenStatus } from '../../shared/ui/FullScreenStatus';
import { Page } from '../../shared/ui/Page';
import { ReportProfile } from './ReportProfile';

/** A talent as agents see them: ready media only, age in years, never the date of birth. */
export function TalentProfilePage() {
  const { handle = '' } = useParams();
  const profile = useQuery({
    queryKey: ['talents', handle],
    queryFn: () => api.call('talents.getByHandle', { params: { handle } }),
    retry: (failures, error) => !isApiError(error, 'NOT_FOUND') && failures < 2,
  });
  const portfolio = useQuery({
    queryKey: ['talents', handle, 'portfolio'],
    queryFn: () => api.call('talents.getPortfolio', { params: { handle } }),
    enabled: profile.isSuccess,
  });

  if (profile.isPending) return <FullScreenStatus />;
  if (profile.isError) {
    return (
      <Page title={t('talent.notAvailable')}>
        {isApiError(profile.error, 'NOT_FOUND') ? null : (
          <FormMessage tone="error">{errorMessage(profile.error)}</FormMessage>
        )}
      </Page>
    );
  }

  const talent = profile.data;
  const facts = [
    talent.category.name,
    talent.subcategories.map((entry) => entry.name).join(', '),
    talent.city.name,
    talent.ageYears === null ? null : t('talent.age', { age: talent.ageYears }),
  ].filter(Boolean);

  return (
    <Page
      title={talent.displayName}
      documentTitle={t('titles.talentProfile', { name: talent.displayName })}
      subtitle={facts.join(' · ')}
      hero={
        talent.avatarUrls ? <img className="avatar" src={talent.avatarUrls.medium} alt="" /> : null
      }
    >
      {talent.verified ? <span className="badge badge--ready">{t('talent.verified')}</span> : null}
      <p style={{ whiteSpace: 'pre-line' }}>{talent.bio}</p>
      {talent.skills.length > 0 ? (
        <section className="stack" aria-labelledby="skills-heading">
          <h2 id="skills-heading">{t('talent.skills')}</h2>
          <ul className="row" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {talent.skills.map((skill) => (
              <li key={skill.slug} className="badge">
                {skill.name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="stack" aria-labelledby="portfolio-heading">
        <h2 id="portfolio-heading">{t('talent.portfolio')}</h2>
        {portfolio.data && portfolio.data.items.length === 0 ? (
          <p className="page__subtitle">{t('talent.noPortfolio')}</p>
        ) : null}
        <ul className="portfolio-grid">
          {portfolio.data?.items.map((item, index) => {
            // The caption is printed under the media, so the media's own name must not repeat it.
            const values = { position: index + 1, name: talent.displayName };
            return (
              <li key={item.id}>
                <figure className="stack" style={{ gap: 'var(--space-xs)', margin: 0 }}>
                  {item.kind === 'video' ? (
                    <VideoPlayer playback={item.video} label={t('talent.videoAlt', values)} />
                  ) : (
                    <img
                      className="media-frame"
                      src={item.urls.medium}
                      srcSet={`${item.urls.small} 256w, ${item.urls.medium} 1024w, ${item.urls.large} 2048w`}
                      sizes="(max-width: 30rem) 50vw, 15rem"
                      alt={t('talent.photoAlt', values)}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  {item.caption ? (
                    <figcaption className="field__hint">{item.caption}</figcaption>
                  ) : null}
                </figure>
              </li>
            );
          })}
        </ul>
      </section>
      <p className="field__hint">{t('talent.contactSoon')}</p>
      <ReportProfile handle={talent.handle} />
    </Page>
  );
}
