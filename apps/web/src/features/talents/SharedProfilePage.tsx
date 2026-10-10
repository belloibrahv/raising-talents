import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, MapPin, Search, Sparkles, UserPlus } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { isApiError } from '../../shared/api/api-error';
import { api } from '../../shared/api/client';
import { VideoPlayer } from '../../shared/media/VideoPlayer';
import { BrandMark } from '../../shared/ui/BrandMark';
import { Button } from '../../shared/ui/Button';
import { FullScreenStatus } from '../../shared/ui/FullScreenStatus';

/**
 * A talent's page for anyone with the link, signed in or not (ADR-042). It is also the
 * best advert for the product, so it ends by inviting both kinds of visitor in.
 */
export function SharedProfilePage() {
  const { code = '' } = useParams();
  const heading = useRef<HTMLHeadingElement>(null);
  const page = useQuery({
    queryKey: ['shared', code],
    // A link without its code (or an old one) has nothing to load.
    enabled: code !== '',
    queryFn: () => api.call('talents.shared', { params: { code } }),
    retry: (failures, error) => !isApiError(error, 'NOT_FOUND') && failures < 2,
  });
  const talent = page.data;

  useLayoutEffect(() => {
    const name = t('common.appName');
    document.title = talent ? `${talent.displayName} | ${name}` : name;
    heading.current?.focus();
  }, [talent]);

  if (page.isPending && code !== '') return <FullScreenStatus />;
  // A failure that is not "not found" is ours, not the visitor's: offer to try again.
  const failed = page.isError && !isApiError(page.error, 'NOT_FOUND');

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            to="/welcome"
            className="flex items-center gap-2.5 font-display text-lg font-bold whitespace-nowrap no-underline"
          >
            <BrandMark />
            {t('common.appName')}
          </Link>
          <Link
            to="/sign-up"
            className={cn(buttonVariants({ variant: 'spotlight', size: 'sm' }), 'no-underline')}
          >
            {t('welcome.join')}
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto grid max-w-5xl gap-10 px-4 pt-6 pb-16 sm:px-6 sm:pt-10">
        {!talent ? (
          <section className="grid justify-items-center gap-4 py-20 text-center">
            <h1 ref={heading} tabIndex={-1} className="text-3xl font-bold">
              {failed ? t('shared.failed') : t('shared.notAvailable')}
            </h1>
            <p className="max-w-md text-muted-foreground">
              {failed ? t('shared.failedBody') : t('shared.notAvailableBody')}
            </p>
            {failed ? (
              <Button
                onClick={() => {
                  void page.refetch();
                }}
              >
                {t('common.tryAgain')}
              </Button>
            ) : null}
            <Link
              to="/welcome"
              className={cn(buttonVariants({ variant: 'outline' }), 'no-underline')}
            >
              {t('shared.discover')}
            </Link>
          </section>
        ) : (
          <>
            <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
              <div className="h-32 bg-stage stage-glow sm:h-44" aria-hidden="true" />
              <div className="flex flex-col gap-4 px-5 pb-6 sm:flex-row sm:items-end sm:gap-6 sm:px-8">
                {talent.avatarUrls ? (
                  <img
                    className="-mt-16 size-32 shrink-0 rounded-full bg-muted object-cover shadow-xl ring-4 ring-card sm:-mt-20 sm:size-40"
                    src={talent.avatarUrls.medium}
                    alt=""
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="-mt-16 grid size-32 shrink-0 place-items-center rounded-full bg-stage font-display text-5xl font-bold text-stage-foreground shadow-xl ring-4 ring-card sm:-mt-20 sm:size-40"
                  >
                    {talent.displayName.slice(0, 1)}
                  </span>
                )}
                <div className="grid gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1
                      ref={heading}
                      tabIndex={-1}
                      className="font-display text-3xl leading-tight font-bold sm:text-4xl"
                    >
                      {talent.displayName}
                    </h1>
                    {talent.verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-success-surface px-2.5 py-0.5 text-sm font-semibold text-success">
                        <BadgeCheck aria-hidden="true" className="size-4" />
                        {t('talent.verified')}
                      </span>
                    ) : null}
                  </div>
                  <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                    <li className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium">
                      <Sparkles aria-hidden="true" className="size-4 text-muted-foreground" />
                      {talent.discipline}
                    </li>
                    <li className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-medium">
                      <MapPin aria-hidden="true" className="size-4 text-muted-foreground" />
                      {talent.city}
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="stack gap-3" aria-labelledby="shared-about">
              <h2 id="shared-about" className="text-xl font-semibold">
                {t('talent.about')}
              </h2>
              <p className="text-lg leading-relaxed whitespace-pre-line">{talent.bio}</p>
              {talent.skills.length > 0 ? (
                <ul
                  className="m-0 flex list-none flex-wrap gap-2 p-0"
                  aria-label={t('talent.skills')}
                >
                  {talent.skills.map((skill) => (
                    <li
                      key={skill}
                      className="rounded-full bg-secondary px-3 py-1 text-sm font-medium"
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            {talent.portfolio.length > 0 ? (
              <section className="stack" aria-labelledby="shared-work">
                <h2 id="shared-work" className="text-xl font-semibold">
                  {t('talent.portfolio')}
                </h2>
                <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
                  {talent.portfolio.map((item, index) => {
                    const values = { position: index + 1, name: talent.displayName };
                    return (
                      <li
                        key={item.id}
                        className={index === 0 ? 'col-span-2 row-span-2' : undefined}
                      >
                        <figure className="m-0 flex h-full flex-col gap-1.5">
                          {item.kind === 'video' ? (
                            <VideoPlayer
                              playback={item.video}
                              label={t('talent.videoAlt', values)}
                            />
                          ) : (
                            <img
                              className="aspect-[4/5] w-full flex-1 rounded-2xl bg-muted object-cover"
                              src={item.urls.medium}
                              srcSet={`${item.urls.small} 256w, ${item.urls.medium} 1024w, ${item.urls.large} 2048w`}
                              sizes={
                                index === 0
                                  ? '(max-width: 40rem) 100vw, 40rem'
                                  : '(max-width: 40rem) 50vw, 20rem'
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
            ) : null}

            <section
              className="grid gap-6 rounded-3xl bg-stage p-6 text-stage-foreground stage-glow sm:grid-cols-2 sm:p-10"
              aria-labelledby="shared-cta"
            >
              <h2 id="shared-cta" className="sr-only">
                {t('shared.ctaLabel')}
              </h2>
              <div className="grid content-start gap-3">
                <Search aria-hidden="true" className="size-7 text-spotlight" />
                <p className="m-0 text-xl font-bold">
                  {t('shared.agentTitle', { name: talent.displayName })}
                </p>
                <p className="m-0 text-stage-foreground/75">{t('shared.agentBody')}</p>
                <Link
                  to="/sign-up"
                  className={cn(
                    buttonVariants({ variant: 'spotlight' }),
                    'mt-2 w-fit no-underline',
                  )}
                >
                  {t('shared.agentCta')}
                </Link>
              </div>
              <div className="grid content-start gap-3">
                <UserPlus aria-hidden="true" className="size-7 text-spotlight" />
                <p className="m-0 text-xl font-bold">{t('shared.talentTitle')}</p>
                <p className="m-0 text-stage-foreground/75">{t('shared.talentBody')}</p>
                <Link
                  to="/sign-up"
                  className={cn(
                    buttonVariants({ variant: 'outline' }),
                    'mt-2 w-fit border-stage-foreground/40 bg-transparent text-stage-foreground no-underline hover:bg-stage-foreground/10 hover:text-stage-foreground',
                  )}
                >
                  {t('shared.talentCta')}
                </Link>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
