import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { api } from '../../shared/api/client';
import { VideoPlayer } from '../../shared/media/VideoPlayer';
import { FormMessage } from '../../shared/ui/FormMessage';
import { PageSkeleton } from '../../shared/ui/PageSkeleton';
import { Page } from '../../shared/ui/Page';
import { ReportProfile } from './ReportProfile';
import { useSession } from '../auth/use-auth';
import { SaveToggle } from '../shortlist/SaveToggle';
import { Badge } from '@/components/ui/badge';
import { VerifiedBadge } from '../../shared/ui/VerifiedBadge';
import { Cake, ImageOff, MapPin, MessageCircle, Sparkles } from 'lucide-react';
import { buttonLink } from '../../shared/ui/Button';
import { ContactPanel } from '../messages/ContactPanel';
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

  if (profile.isPending) return <PageSkeleton variant="profile" />;
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
  const discipline =
    talent.subcategories.map((entry) => entry.name).join(', ') || talent.category.name;
  const chips = [
    { icon: Sparkles, label: discipline },
    { icon: MapPin, label: talent.city.name },
    ...(talent.ageYears === null
      ? []
      : [{ icon: Cake, label: t('talent.age', { age: talent.ageYears }) }]),
  ];

  return (
    <Page
      title={talent.displayName}
      documentTitle={t('titles.talentProfile', { name: talent.displayName })}
      width="wide"
      className="[&>div]:max-w-5xl [&>div>header]:sr-only"
      hero={
        <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div
            className="h-32 bg-stage [background-image:radial-gradient(ellipse_55%_120%_at_15%_0%,rgb(255_201_60/0.55),transparent_70%),radial-gradient(ellipse_50%_120%_at_95%_100%,rgb(142_162_255/0.35),transparent_70%)] sm:h-44"
            aria-hidden="true"
          />
          <div className="flex flex-col gap-5 px-5 pb-6 sm:flex-row sm:items-end sm:gap-6 sm:px-8">
            {talent.avatarUrls ? (
              <img
                className="-mt-16 size-32 shrink-0 rounded-full bg-muted object-cover shadow-xl ring-4 ring-card sm:-mt-20 sm:size-40"
                src={talent.avatarUrls.medium}
                alt=""
              />
            ) : (
              <span
                className="-mt-16 grid size-32 shrink-0 place-items-center rounded-full bg-stage font-display text-5xl font-bold text-stage-foreground shadow-xl ring-4 ring-card sm:-mt-20 sm:size-40"
                aria-hidden="true"
              >
                {talent.displayName.slice(0, 1)}
              </span>
            )}
            <div className="grid min-w-0 flex-1 gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <p
                  className="m-0 font-display text-3xl leading-tight font-bold sm:text-4xl"
                  aria-hidden="true"
                >
                  {talent.displayName}
                </p>
                {talent.verified ? <VerifiedBadge /> : null}
              </div>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {chips.map(({ icon: Icon, label }) => (
                  <li
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium"
                  >
                    <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>
            {canSave ? (
              <div className="flex shrink-0 items-start gap-2 sm:items-end">
                <a href="#contact" className={buttonLink('primary', 'sm')}>
                  <MessageCircle aria-hidden="true" />
                  {t('talent.contact')}
                </a>
                <SaveToggle handle={talent.handle} name={talent.displayName} />
              </div>
            ) : null}
          </div>
        </section>
      }
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="grid gap-10">
          <section className="stack gap-3" aria-labelledby="about-heading">
            <h2 id="about-heading" className="text-xl font-semibold">
              {t('talent.about')}
            </h2>
            <p className="text-lg leading-relaxed whitespace-pre-line">{talent.bio}</p>
            {talent.skills.length > 0 ? (
              <ul className="row m-0 mt-2 list-none gap-2 p-0" aria-label={t('talent.skills')}>
                {talent.skills.map((skill) => (
                  <li key={skill.slug}>
                    <Badge variant="secondary" className="px-3 py-1 text-sm">
                      {skill.name}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
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
                  <li key={item.id} className={index === 0 ? 'col-span-2 row-span-2' : undefined}>
                    <figure className="m-0 flex h-full flex-col gap-1.5">
                      {item.kind === 'video' ? (
                        <VideoPlayer playback={item.video} label={t('talent.videoAlt', values)} />
                      ) : (
                        <img
                          className="aspect-[4/5] w-full flex-1 rounded-2xl bg-muted object-cover"
                          src={item.urls.medium}
                          srcSet={`${item.urls.small} 256w, ${item.urls.medium} 1024w, ${item.urls.large} 2048w`}
                          sizes={
                            index === 0
                              ? '(max-width: 40rem) 100vw, 30rem'
                              : '(max-width: 40rem) 50vw, 15rem'
                          }
                          alt={t('talent.photoAlt', values)}
                          loading={index < 3 ? 'eager' : 'lazy'}
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
        </div>
        <aside
          className="grid gap-4 lg:sticky lg:top-24"
          id="contact"
          aria-label={t('talent.contact')}
        >
          {canSave ? <ContactPanel handle={talent.handle} name={talent.displayName} /> : null}
          <ReportProfile handle={talent.handle} />
        </aside>
      </div>
    </Page>
  );
}
