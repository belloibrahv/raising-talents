import { ArrowRight, Check, Heart, MapPin, Search, ShieldCheck } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { LEGAL_URLS } from '../../shared/config';
import { BrandLockup, BrandMark } from '../../shared/ui/BrandMark';
import { Eyebrow, StageTag } from '../../shared/ui/Stage';
import { TalentCard } from '../../shared/ui/TalentCard';

const DISCIPLINES = [
  'athletes',
  'musicians',
  'models',
  'actors',
  'dancers',
  'artists',
  'creators',
] as const;
type Discipline = (typeof DISCIPLINES)[number];

interface Sample {
  readonly name: string;
  readonly what: string;
  readonly city: string;
  readonly tag: string;
  /** In public/images/landing; credits in docs/brand/photo-credits.md. */
  readonly image: string;
  readonly alt: string;
  readonly followers: string;
}

/**
 * Sample profiles until talent agree to be featured (brand guide section 07: consent first).
 * The photos are from Unsplash and show nobody whose face can be told, so the invented names
 * never sit on a real person. Africa first, the world always.
 */
const SAMPLES: Record<Discipline, readonly Sample[]> = {
  athletes: [
    {
      name: 'Tobi Adebayo',
      what: 'Sprinter',
      city: 'Ibadan, Nigeria',
      tag: '100m',
      image: 'athletes-1',
      alt: 'A runner on a beach at sunset, in silhouette',
      followers: '2.4k',
    },
    {
      name: 'Amara Diallo',
      what: 'Distance runner',
      city: 'Dakar, Senegal',
      tag: 'Road running',
      image: 'athletes-2',
      alt: 'A runner with arms out on the sand at golden hour',
      followers: '3.1k',
    },
    {
      name: 'Lucas Silva',
      what: 'Skateboarder',
      city: 'São Paulo',
      tag: 'Street',
      image: 'athletes-3',
      alt: 'A skateboarder in silhouette against the sun',
      followers: '1.7k',
    },
    {
      name: 'Hana Kim',
      what: 'Climber',
      city: 'Seoul',
      tag: 'Bouldering',
      image: 'athletes-4',
      alt: 'A climber in silhouette on a rock face',
      followers: '2.2k',
    },
  ],
  musicians: [
    {
      name: 'Wanjiru K.',
      what: 'Vocalist',
      city: 'Nairobi, Kenya',
      tag: 'Soul',
      image: 'musicians-1',
      alt: 'A vocalist at the mic under warm stage light',
      followers: '4.8k',
    },
    {
      name: 'Femi Oduya',
      what: 'Rapper',
      city: 'Lagos, Nigeria',
      tag: 'Afrobeats',
      image: 'musicians-2',
      alt: 'A singer in silhouette against red stage light',
      followers: '3.3k',
    },
    {
      name: 'Bisi Lawal',
      what: 'Singer-songwriter',
      city: 'Lagos, Nigeria',
      tag: 'Acoustic',
      image: 'musicians-3',
      alt: 'A guitarist on stage under spotlights',
      followers: '2.9k',
    },
    {
      name: 'Ravi Mehta',
      what: 'Vocalist',
      city: 'Mumbai',
      tag: 'Jazz',
      image: 'musicians-4',
      alt: 'A singer at a mic stand in a single spotlight',
      followers: '1.6k',
    },
  ],
  models: [
    {
      name: 'Ifeoma Obi',
      what: 'Editorial',
      city: 'Abuja, Nigeria',
      tag: 'Editorial',
      image: 'models-1',
      alt: "A model's shadow in a hat on a sunlit wall",
      followers: '5.2k',
    },
    {
      name: 'Carla Duarte',
      what: 'Fashion',
      city: 'Lisbon',
      tag: 'Fashion',
      image: 'models-2',
      alt: 'A model in a red dress in a lit doorway',
      followers: '2.7k',
    },
    {
      name: 'Leila Amin',
      what: 'Commercial',
      city: 'Cairo, Egypt',
      tag: 'Commercial',
      image: 'models-3',
      alt: 'A model in profile, lit from behind',
      followers: '1.9k',
    },
    {
      name: 'Zola Mbeki',
      what: 'Runway',
      city: 'Cape Town',
      tag: 'Runway',
      image: 'models-4',
      alt: 'A model in silhouette against a bright doorway',
      followers: '3.6k',
    },
  ],
  actors: [
    {
      name: 'Kwame Boadu',
      what: 'Stage actor',
      city: 'Accra, Ghana',
      tag: 'Theatre',
      image: 'actors-1',
      alt: 'An actor in a lion costume mid-scene',
      followers: '1.4k',
    },
    {
      name: 'Sofia Marín',
      what: 'Performer',
      city: 'Mexico City',
      tag: 'Physical theatre',
      image: 'actors-2',
      alt: 'A performer alone on a dark blue stage',
      followers: '2.8k',
    },
    {
      name: 'Tunde Bakare',
      what: 'Ensemble actor',
      city: 'Ibadan, Nigeria',
      tag: 'Theatre',
      image: 'actors-3',
      alt: 'A cast rehearsing under studio lights',
      followers: '2.1k',
    },
    {
      name: 'Priya Nair',
      what: 'Comedian',
      city: 'London',
      tag: 'Stand-up',
      image: 'actors-4',
      alt: 'A microphone in a single spotlight',
      followers: '1.8k',
    },
  ],
  dancers: [
    {
      name: 'Maya Richards',
      what: 'Contemporary',
      city: 'London, UK',
      tag: 'Contemporary',
      image: 'dancers-1',
      alt: 'A dancer reaching up into a single spotlight',
      followers: '9.4k',
    },
    {
      name: 'Aiko Tanaka',
      what: 'Ballet',
      city: 'Tokyo',
      tag: 'Ballet',
      image: 'dancers-2',
      alt: 'A ballet dancer in silhouette',
      followers: '4.3k',
    },
    {
      name: 'Seun Afolabi',
      what: 'Afro dance',
      city: 'Lagos, Nigeria',
      tag: 'Afro',
      image: 'dancers-3',
      alt: 'A dancer in silhouette mid-move',
      followers: '6.1k',
    },
    {
      name: 'Jordan Lee',
      what: 'Hip hop',
      city: 'New York',
      tag: 'Hip hop',
      image: 'dancers-4',
      alt: 'A dancer in silhouette against an orange sky',
      followers: '3.9k',
    },
  ],
  artists: [
    {
      name: 'Zainab Yusuf',
      what: 'Painter',
      city: 'Abuja, Nigeria',
      tag: 'Painting',
      image: 'artists-1',
      alt: 'Paint-stained hands holding brushes',
      followers: '2.6k',
    },
    {
      name: 'Mateo Ruiz',
      what: 'Watercolourist',
      city: 'Bogotá',
      tag: 'Watercolour',
      image: 'artists-2',
      alt: 'A painter mixing watercolours',
      followers: '1.9k',
    },
    {
      name: 'Esi Owusu',
      what: 'Painter',
      city: 'Accra, Ghana',
      tag: 'Oils',
      image: 'artists-3',
      alt: "A painter's hand over a palette",
      followers: '1.2k',
    },
    {
      name: 'Lina Haddad',
      what: 'Muralist',
      city: 'Beirut',
      tag: 'Murals',
      image: 'artists-4',
      alt: "A muralist's gloved hand on a painted wall",
      followers: '3.4k',
    },
  ],
  creators: [
    {
      name: 'Dayo Adeyemi',
      what: 'Filmmaker',
      city: 'Lagos, Nigeria',
      tag: 'Film',
      image: 'creators-1',
      alt: 'A creator filming the city at sunset',
      followers: '8.7k',
    },
    {
      name: 'Noor Saleh',
      what: 'Video creator',
      city: 'Dubai',
      tag: 'Video',
      image: 'creators-2',
      alt: 'A creator with a video camera under pink light',
      followers: '5.5k',
    },
    {
      name: 'Ana Costa',
      what: 'Photographer',
      city: 'Rio de Janeiro',
      tag: 'Photo',
      image: 'creators-3',
      alt: 'A photographer in silhouette at golden hour',
      followers: '4.2k',
    },
    {
      name: 'Yuki Sato',
      what: 'Travel creator',
      city: 'Osaka',
      tag: 'Travel',
      image: 'creators-4',
      alt: 'A creator crouched by a tripod on a hill',
      followers: '3.0k',
    },
  ],
};

/** A photo from public/images/landing, 640 by 800 (4:5), filling its frame. */
function Photo({
  image,
  alt,
  eager = false,
  className,
}: {
  readonly image: string;
  readonly alt: string;
  readonly eager?: boolean;
  readonly className?: string;
}) {
  return (
    <img
      src={`/images/landing/${image}.webp`}
      alt={alt}
      width={640}
      height={800}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={cn('size-full object-cover', className)}
    />
  );
}

/** Places people will recognise from every continent. A flavour of "anywhere", not a list of where we are. */
const CITIES = [
  'Lagos',
  'Accra',
  'Nairobi',
  'Johannesburg',
  'London',
  'New York',
  'São Paulo',
  'Mumbai',
  'Seoul',
  'Dubai',
  'Toronto',
  'Paris',
] as const;

const STEPS = ['post', 'follow', 'found'] as const;
const SAFETY = ['verified', 'moderated', 'choose', 'report'] as const;

const primary = cn(buttonVariants(), 'no-underline');
const outline = cn(buttonVariants({ variant: 'outline' }), 'no-underline');
const navLink =
  'inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold text-stage-ink no-underline hover:text-spotlight';

/** A headline in display type with its accent words in Instrument Serif italic. */
function Headline({
  start,
  accent,
  accentClass,
}: {
  readonly start: string;
  readonly accent: string;
  readonly accentClass?: string;
}) {
  return (
    <>
      {start} <span className={cn('accent-word', accentClass)}>{accent}</span>
    </>
  );
}

/**
 * The front door, built to the website design (docs/brand/ui-design.pdf, pages 1 to 4): the
 * stage and the spotlight. One action per screen in marigold; everything else in ink.
 */
export function WelcomePage() {
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    document.title = t('common.appName');
    heading.current?.focus();
  }, []);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="bg-stage stage-glow text-stage-ink">
        <header className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="text-xl">
            <BrandLockup version="spotlight" nameClassName="max-[359px]:sr-only" />
          </span>
          <nav aria-label={t('welcome.nav.label')} className="flex items-center gap-1 sm:gap-2">
            <ul className="m-0 hidden list-none items-center gap-1 p-0 lg:flex">
              <li>
                <a className={navLink} href="#discover">
                  {t('welcome.nav.discover')}
                </a>
              </li>
              <li>
                <a className={navLink} href="#how">
                  {t('welcome.nav.how')}
                </a>
              </li>
              <li>
                <a className={navLink} href="#agents">
                  {t('welcome.nav.agents')}
                </a>
              </li>
              <li>
                <a className={navLink} href="#safety">
                  {t('welcome.nav.safety')}
                </a>
              </li>
            </ul>
            <Link className={cn(navLink, 'lg:ml-6')} to="/sign-in">
              {t('welcome.signInShort')}
            </Link>
            <Link
              className={cn(buttonVariants({ size: 'sm' }), 'no-underline max-sm:hidden')}
              to="/sign-up"
            >
              {t('welcome.join')}
            </Link>
          </nav>
        </header>

        <main id="main">
          <section
            className="mx-auto grid max-w-6xl gap-12 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:pt-14 lg:pb-24"
            aria-labelledby="welcome-heading"
          >
            <div className="flex flex-col items-start gap-6">
              <p className="m-0 inline-flex items-center gap-2 rounded-full border border-stage-ink/25 px-3 py-1.5 text-sm">
                <span className="size-2 rounded-full bg-ember" aria-hidden="true" />
                {t('welcome.eyebrow')}
              </p>
              <h1
                id="welcome-heading"
                ref={heading}
                tabIndex={-1}
                className="m-0 text-[3.5rem] leading-[0.92] uppercase sm:text-7xl lg:text-[5.5rem]"
              >
                <Headline
                  start={t('welcome.headline')}
                  accent={t('welcome.headlineAccent')}
                  accentClass="text-spotlight"
                />
              </h1>
              <p className="m-0 max-w-xl text-lg text-stage-ink-muted">{t('welcome.body')}</p>
              <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                <Link className={primary} to="/sign-up?as=talent">
                  {t('welcome.joinTalent')}
                  <ArrowRight aria-hidden="true" />
                </Link>
                <Link className={outline} to="/sign-up?as=agent">
                  {t('welcome.scout')}
                </Link>
              </div>
              <p className="m-0 text-sm text-stage-ink-muted">
                {t('welcome.free')}{' '}
                <Link className="text-stage-ink" to="/sign-in">
                  {t('welcome.signIn')}
                </Link>
              </p>
            </div>
            <Showcase />
          </section>
        </main>
      </div>

      <section aria-label={t('welcome.disciplinesLabel')} className="border-b bg-background">
        <ul className="mx-auto flex max-w-6xl list-none flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 py-8 sm:gap-x-7 sm:px-6">
          {DISCIPLINES.map((key, index) => (
            <li key={key} className="flex items-center gap-5 sm:gap-7">
              {index > 0 ? (
                <span className="size-2 rounded-full bg-ember" aria-hidden="true" />
              ) : null}
              <span className="font-display text-2xl font-bold tracking-[-0.01em] uppercase sm:text-4xl">
                {t(`welcome.disciplines.${key}`)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <Discover />

      <section
        id="how"
        className="mx-auto max-w-6xl scroll-mt-4 px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="how-heading"
      >
        <Eyebrow>{t('welcome.steps.eyebrow')}</Eyebrow>
        <h2
          id="how-heading"
          className="mt-3 mb-10 max-w-2xl font-display text-4xl leading-[0.95] font-bold tracking-[-0.01em] uppercase sm:text-6xl"
        >
          <Headline start={t('welcome.steps.title')} accent={t('welcome.steps.titleAccent')} />
        </h2>
        <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
          {STEPS.map((key, index) => {
            const last = index === STEPS.length - 1;
            return (
              <li
                key={key}
                className={cn(
                  'flex gap-4 rounded-lg p-6 md:flex-col md:gap-3',
                  last ? 'bg-stage text-stage-ink' : 'bg-surface-sunk',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'font-display text-5xl leading-none font-bold',
                    last && 'text-spotlight',
                  )}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="grid gap-2">
                  <h3 className="m-0 text-lg font-bold">{t(`welcome.steps.${key}`)}</h3>
                  <p
                    className={cn(
                      'm-0 text-sm',
                      last ? 'text-stage-ink-muted' : 'text-muted-foreground',
                    )}
                  >
                    {t(`welcome.steps.${key}Body`)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <ForAgents />

      <section
        id="safety"
        className="mx-auto max-w-6xl scroll-mt-4 px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="safety-heading"
      >
        <div className="mb-10 grid gap-4 md:grid-cols-[1.4fr_1fr] md:items-end">
          <h2
            id="safety-heading"
            className="m-0 font-display text-4xl leading-[0.95] font-bold tracking-[-0.01em] uppercase sm:text-6xl"
          >
            <Headline start={t('welcome.safe.title')} accent={t('welcome.safe.titleAccent')} />
          </h2>
          <p className="m-0 text-muted-foreground">{t('welcome.safe.body')}</p>
        </div>
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {SAFETY.map((key) => (
            <li key={key} className="grid content-start gap-3 rounded-lg border bg-card p-5">
              <span className="grid size-9 place-items-center rounded-full bg-verified-soft text-verified">
                <ShieldCheck aria-hidden="true" className="size-5" strokeWidth={1.75} />
              </span>
              <h3 className="m-0 text-base font-bold">{t(`welcome.safe.${key}`)}</h3>
              <p className="m-0 text-sm text-muted-foreground">{t(`welcome.safe.${key}Body`)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y bg-card" aria-labelledby="cities-heading">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-12 sm:px-6">
          <Eyebrow className="text-muted-foreground">
            <span id="cities-heading">{t('welcome.cities')}</span>
          </Eyebrow>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {CITIES.map((city) => (
              <li
                key={city}
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm"
              >
                <MapPin aria-hidden="true" className="size-3.5 text-muted-foreground" />
                {city}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="cta-heading"
      >
        <div className="relative overflow-hidden rounded-3xl bg-spotlight px-6 py-12 text-spotlight-ink sm:px-14 sm:py-16">
          <BrandMark
            version="ink"
            className="pointer-events-none absolute -top-6 -right-6 size-40 text-spotlight-ink/10 sm:size-56"
          />
          <h2
            id="cta-heading"
            className="relative m-0 max-w-2xl font-display text-5xl leading-[0.92] font-bold tracking-[-0.01em] uppercase sm:text-7xl"
          >
            <Headline start={t('welcome.cta.title')} accent={t('welcome.cta.titleAccent')} />
          </h2>
          <div className="relative mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              className={cn(
                buttonVariants(),
                'bg-spotlight-ink text-spotlight no-underline hover:bg-spotlight-ink/90',
              )}
              to="/sign-up?as=talent"
            >
              {t('welcome.joinTalent')}
            </Link>
            <Link className={outline} to="/sign-up?as=agent">
              {t('welcome.joinAgent')}
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1fr_auto]">
          <div className="grid content-start gap-3">
            <span className="text-xl">
              <BrandLockup />
            </span>
            <p className="m-0 text-sm text-muted-foreground">{t('welcome.footer.made')}</p>
          </div>
          <div className="grid grid-cols-3 gap-8 text-sm">
            <FooterColumn title={t('welcome.footer.talent')}>
              <Link to="/sign-up?as=talent">{t('welcome.joinTalent')}</Link>
              <a href="#how">{t('welcome.nav.how')}</a>
              <a href="#safety">{t('welcome.footer.staySafe')}</a>
            </FooterColumn>
            <FooterColumn title={t('welcome.footer.agents')}>
              <Link to="/sign-up?as=agent">{t('welcome.joinAgent')}</Link>
              <a href="#agents">{t('welcome.footer.verification')}</a>
              <a href="#discover">{t('welcome.footer.discover')}</a>
            </FooterColumn>
            <FooterColumn title={t('welcome.footer.legal')}>
              <a href={LEGAL_URLS.terms} target="_blank" rel="noreferrer">
                {t('welcome.footer.terms')}
              </a>
              <a href={LEGAL_URLS.guidelines} target="_blank" rel="noreferrer">
                {t('welcome.footer.guidelines')}
              </a>
              <a href={LEGAL_URLS.privacy} target="_blank" rel="noreferrer">
                {t('welcome.footer.privacy')}
              </a>
            </FooterColumn>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterColumn({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <nav aria-label={title} className="grid content-start gap-2">
      <span className="font-bold">{title}</span>
      <div className="grid gap-2 [&_a]:text-foreground [&_a]:underline">{children}</div>
    </nav>
  );
}

/** The hero's picture: talent on the stage, a like and an agency's save. Decorative. */
function Showcase() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto h-[22rem] w-full max-w-md select-none sm:h-[30rem]"
    >
      <ShowcaseCard
        className="top-10 left-0 h-[15rem] w-[52%] sm:h-[18rem]"
        tag="Athlete · 100m"
        image="athletes-1"
        name="Tobi Adebayo"
        city="Ibadan, Nigeria"
      />
      <ShowcaseCard
        className="top-0 right-0 h-[17rem] w-[52%] sm:h-[15rem]"
        tag="Dancer · Contemporary"
        image="dancers-1"
      />
      <ShowcaseCard
        className="right-[6%] bottom-0 h-[12rem] w-[44%] max-sm:hidden sm:h-[13.5rem]"
        tag="Musician"
        image="musicians-1"
        name="Wanjiru K."
        city="Nairobi, Kenya"
      />
      <span className="absolute -top-3 right-[38%] inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-ink shadow-lg">
        <Heart className="size-3.5 fill-ember text-ember" />
        {t('welcome.showcase.likes')}
      </span>
      <span className="absolute bottom-2 left-0 flex max-w-[15rem] items-center gap-3 rounded-lg bg-surface p-3 text-ink shadow-lg">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-verified-soft text-verified">
          <Check className="size-4" />
        </span>
        <span className="grid text-xs">
          <span className="font-semibold">{t('welcome.showcase.saved')}</span>
          <span className="text-ink-muted">{t('welcome.showcase.savedWhen')}</span>
        </span>
      </span>
    </div>
  );
}

function ShowcaseCard({
  className,
  tag,
  image,
  name,
  city,
}: {
  readonly className: string;
  readonly tag: string;
  readonly image: string;
  readonly name?: string;
  readonly city?: string;
}) {
  return (
    <div
      className={cn(
        'absolute overflow-hidden rounded-3xl border border-stage-ink/10 bg-stage shadow-lg',
        className,
      )}
    >
      {/* The hero's first picture: loaded at once, the rest of the page's photos lazily. */}
      <Photo image={image} alt="" eager />
      <StageTag className="absolute top-3 left-3">{tag}</StageTag>
      {name ? (
        <span className="absolute inset-x-0 bottom-0 grid bg-gradient-to-t from-stage/85 to-transparent px-4 pt-10 pb-4">
          <span className="font-display text-xl font-bold">{name}</span>
          <span className="text-xs text-stage-ink-muted">{city}</span>
        </span>
      ) : null}
    </div>
  );
}

/** "Real people. Real work.": sample talent by discipline, until real ones agree to be featured. */
function Discover() {
  const [discipline, setDiscipline] = useState<Discipline>('dancers');
  return (
    <section
      id="discover"
      className="mx-auto max-w-6xl scroll-mt-4 px-4 py-16 sm:px-6 sm:py-24"
      aria-labelledby="discover-heading"
    >
      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr] md:items-end">
        <div className="grid gap-3">
          <Eyebrow>{t('welcome.discover.eyebrow')}</Eyebrow>
          <h2
            id="discover-heading"
            className="m-0 font-display text-4xl leading-[0.95] font-bold tracking-[-0.01em] uppercase sm:text-6xl"
          >
            <Headline
              start={t('welcome.discover.title')}
              accent={t('welcome.discover.titleAccent')}
            />
          </h2>
        </div>
        <p className="m-0 text-muted-foreground">{t('welcome.discover.body')}</p>
      </div>
      <div
        role="group"
        aria-label={t('welcome.discover.filter')}
        className="-mx-4 my-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {DISCIPLINES.map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={discipline === key}
            onClick={() => {
              setDiscipline(key);
            }}
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-full border-[1.5px] border-input bg-card px-4 text-sm font-semibold transition-colors hover:border-foreground aria-pressed:border-foreground aria-pressed:bg-spotlight-soft"
          >
            {t(`welcome.disciplines.${key}`)}
          </button>
        ))}
      </div>
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:gap-4 lg:grid-cols-4">
        {SAMPLES[discipline].map((sample) => (
          <li key={sample.name}>
            <TalentCard
              className="h-full"
              name={sample.name}
              detail={`${sample.what} · ${sample.city}`}
              tag={sample.tag}
              media={<Photo image={sample.image} alt={sample.alt} />}
              meta={
                <span className="max-sm:hidden">
                  {t('welcome.discover.followers', { count: sample.followers })}
                </span>
              }
              action={
                <Link
                  className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'no-underline')}
                  to="/sign-up"
                  aria-label={`${t('welcome.discover.view')} ${sample.name}`}
                >
                  {t('welcome.discover.view')}
                </Link>
              }
            />
          </li>
        ))}
      </ul>
      <p className="mt-6 mb-0 text-sm text-muted-foreground">{t('welcome.discover.sample')}</p>
    </section>
  );
}

/** The agents panel: what an agent gets, with a glimpse of search. */
function ForAgents() {
  const rows = [
    { name: 'Femi Oduya', what: 'Rapper · Lagos · 3 videos', saved: true, image: 'musicians-2' },
    {
      name: 'Bisi Lawal',
      what: 'Singer-songwriter · Lagos · 5 videos',
      saved: false,
      image: 'musicians-3',
    },
    { name: 'Kemi Ade', what: 'Vocalist · Ikeja · 2 videos', saved: false, image: 'musicians-4' },
  ];
  return (
    <section
      id="agents"
      className="mx-auto max-w-6xl scroll-mt-4 px-4 sm:px-6"
      aria-labelledby="agents-heading"
    >
      <div className="grid gap-10 rounded-3xl bg-stage p-6 text-stage-ink sm:p-12 lg:grid-cols-2 lg:items-center">
        <div className="flex flex-col items-start gap-5">
          <Eyebrow onStage>{t('welcome.agents.eyebrow')}</Eyebrow>
          <h2
            id="agents-heading"
            className="m-0 font-display text-4xl leading-[0.95] font-bold tracking-[-0.01em] uppercase sm:text-5xl"
          >
            <Headline
              start={t('welcome.agents.title')}
              accent={t('welcome.agents.titleAccent')}
              accentClass="text-spotlight"
            />
          </h2>
          <ul className="m-0 grid list-none gap-3 p-0 text-stage-ink-muted">
            {(['search', 'shortlist', 'badge'] as const).map((key) => (
              <li key={key} className="flex gap-3">
                <span
                  className="mt-2 size-2 shrink-0 rounded-[2px] bg-spotlight"
                  aria-hidden="true"
                />
                {t(`welcome.agents.${key}`)}
              </li>
            ))}
          </ul>
          <Link className={primary} to="/sign-up?as=agent">
            {t('welcome.agents.cta')}
          </Link>
        </div>
        <div
          aria-hidden="true"
          className="grid gap-3 rounded-lg border border-stage-ink/10 bg-stage-ink/5 p-4 select-none"
        >
          <span className="flex items-center gap-2 rounded-full bg-stage-ink/10 px-4 py-2.5 text-sm text-stage-ink-muted">
            <Search className="size-4" />
            {t('welcome.agents.query')}
          </span>
          <span className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-spotlight/15 px-3 py-1.5 font-semibold text-spotlight">
              {t('welcome.disciplines.musicians')}
            </span>
            <span className="rounded-full border border-stage-ink/30 px-3 py-1.5">
              Lagos, Nigeria
            </span>
          </span>
          {rows.map((row) => (
            <span key={row.name} className="flex items-center gap-3 rounded-lg bg-stage-ink/5 p-3">
              <span className="size-10 shrink-0 overflow-hidden rounded-sm">
                <Photo image={row.image} alt="" />
              </span>
              <span className="grid flex-1 text-sm">
                <span className="font-semibold">{row.name}</span>
                <span className="text-xs text-stage-ink-muted">{row.what}</span>
              </span>
              <span
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-semibold',
                  row.saved ? 'border-stage-verified text-stage-verified' : 'border-stage-ink/60',
                )}
              >
                {row.saved ? t('welcome.agents.saved') : t('welcome.agents.save')}
              </span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
