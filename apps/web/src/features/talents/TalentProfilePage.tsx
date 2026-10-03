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
import { useSession } from '../auth/use-auth';
import { SaveToggle } from '../shortlist/SaveToggle';
import { Badge } from '@/components/ui/badge';
import { VerifiedBadge } from '../../shared/ui/VerifiedBadge';
import { ImageOff, MessageCircleMore } from 'lucide-react';
import { EmptyState } from '../../shared/ui/EmptyState';

/** A talent as agents see them: ready media only, age in years, never the date of birth. */
export function TalentProfilePage() {
  const { handle = '' } = useParams();
  const me = useSession().me;
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
  const canSave = me?.role === 'agent' && me.status === 'active';
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
      width="wide"
      className="[&>div]:max-w-3xl"
      hero={
        <div className="-mb-2">
          <div
            className="h-28 rounded-3xl bg-stage [background-image:radial-gradient(ellipse_60%_90%_at_20%_0%,rgb(255_201_60/0.45),transparent_70%)] sm:h-36"
            aria-hidden="true"
          />
          <div className="-mt-14 flex items-end justify-between gap-4 px-4 sm:-mt-16 sm:px-6">
            {talent.avatarUrls ? (
              <img
                className="size-28 rounded-full bg-muted object-cover shadow-lg ring-4 ring-background sm:size-32"
                src={talent.avatarUrls.medium}
                alt=""
              />
            ) : (
              <span
                className="grid size-28 place-items-center rounded-full bg-muted font-display text-4xl font-bold ring-4 ring-background sm:size-32"
                aria-hidden="true"
              >
                {talent.displayName.slice(0, 1)}
              </span>
            )}
            <div className="flex flex-col items-end gap-2">
              {talent.verified ? <VerifiedBadge /> : null}
              {canSave ? <SaveToggle handle={talent.handle} name={talent.displayName} /> : null}
            </div>
          </div>
        </div>
      }
    >
      <section className="stack gap-3" aria-labelledby="about-heading">
        <h2 id="about-heading" className="text-xl font-semibold">
          {t('talent.about')}
        </h2>
        <p className="text-lg leading-relaxed whitespace-pre-line">{talent.bio}</p>
      </section>
      {talent.skills.length > 0 ? (
        <section className="stack" aria-labelledby="skills-heading">
          <h2 id="skills-heading" className="text-xl font-semibold">
            {t('talent.skills')}
          </h2>
          <ul className="row m-0 list-none gap-2 p-0">
            {talent.skills.map((skill) => (
              <li key={skill.slug}>
                <Badge variant="secondary" className="px-3 py-1 text-sm">
                  {skill.name}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="stack" aria-labelledby="portfolio-heading">
        <h2 id="portfolio-heading" className="text-xl font-semibold">
          {t('talent.portfolio')}
        </h2>
        {portfolio.data && portfolio.data.items.length === 0 ? (
          <EmptyState icon={ImageOff} title={t('talent.noPortfolio')} />
        ) : null}
        <ul className="grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
          {portfolio.data?.items.map((item, index) => {
            // The caption is printed under the media, so the media's own name must not repeat it.
            const values = { position: index + 1, name: talent.displayName };
            return (
              <li key={item.id}>
                <figure className="m-0 flex flex-col gap-1.5">
                  {item.kind === 'video' ? (
                    <VideoPlayer playback={item.video} label={t('talent.videoAlt', values)} />
                  ) : (
                    <img
                      className="aspect-[4/5] w-full rounded-xl bg-muted object-cover"
                      src={item.urls.medium}
                      srcSet={`${item.urls.small} 256w, ${item.urls.medium} 1024w, ${item.urls.large} 2048w`}
                      sizes="(max-width: 30rem) 50vw, 15rem"
                      alt={t('talent.photoAlt', values)}
                      loading="lazy"
                      decoding="async"
                    />
                  )}
                  {item.caption ? (
                    <figcaption className="text-sm text-muted-foreground">
                      {item.caption}
                    </figcaption>
                  ) : null}
                </figure>
              </li>
            );
          })}
        </ul>
      </section>
      <p className="flex items-start gap-3 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
        <MessageCircleMore aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-foreground" />
        {t('talent.contactSoon')}
      </p>
      <ReportProfile handle={talent.handle} />
    </Page>
  );
}
