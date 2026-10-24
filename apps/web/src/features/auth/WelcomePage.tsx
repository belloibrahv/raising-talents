import { ArrowRight, Check, Heart, MapPin, Search, ShieldCheck } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { LEGAL_URLS } from '../../shared/config';
import { BrandLockup, BrandMark } from '../../shared/ui/BrandMark';
import { Eyebrow, StagePlaceholder, StageTag } from '../../shared/ui/Stage';
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
  readonly photo: string;
  readonly followers: string;
}

/**
 * Sample profiles until talent agree to be featured (brand guide section 07: consent first).
 * Africa first, the world always. The caption names the photo each one needs.
 */
const SAMPLES: Record<Discipline, readonly Sample[]> = {
  athletes: [
    {
      name: 'Tobi Adebayo',
      what: 'Sprinter',
      city: 'Ibadan, Nigeria',
      tag: '100m',
      photo: 'sprinter leaving the blocks, golden hour',
      followers: '2.4k',
    },
    {
      name: 'Amara Diallo',
      what: 'Footballer',
      city: 'Dakar, Senegal',
      tag: 'Forward',
      photo: 'striker mid-volley, floodlights',
      followers: '3.1k',
    },
    {
      name: 'Lucas Silva',
      what: 'Swimmer',
      city: 'São Paulo',
      tag: 'Butterfly',
      photo: 'swimmer breaking the surface',
      followers: '1.7k',
    },
    {
      name: 'Hana Kim',
      what: 'Volleyball',
      city: 'Seoul',
      tag: 'Setter',
      photo: 'setter at the net, side light',
      followers: '2.2k',
    },
  ],
  musicians: [
    {
      name: 'Wanjiru K.',
      what: 'Vocalist',
      city: 'Nairobi, Kenya',
      tag: 'Soul',
      photo: 'vocalist at the mic, warm lamp',
      followers: '4.8k',
    },
    {
      name: 'Femi Oduya',
      what: 'Producer',
      city: 'Lagos, Nigeria',
      tag: 'Afrobeats',
      photo: 'producer at the desk, one lamp',
      followers: '3.3k',
    },
    {
      name: 'Bisi Lawal',
      what: 'Vocalist',
      city: 'Lagos, Nigeria',
      tag: 'Highlife',
      photo: 'singer between lines, stage light',
      followers: '2.9k',
    },
    {
      name: 'Ravi Mehta',
      what: 'Tabla',
      city: 'Mumbai',
      tag: 'Classical',
      photo: 'hands on the tabla, close',
      followers: '1.6k',
    },
  ],
  models: [
    {
      name: 'Ifeoma Obi',
      what: 'Runway',
      city: 'Abuja, Nigeria',
      tag: 'Runway',
      photo: 'model mid-stride on the runway',
      followers: '5.2k',
    },
    {
      name: 'Carla Duarte',
      what: 'Editorial',
      city: 'Lisbon',
      tag: 'Editorial',
      photo: 'portrait in window light',
      followers: '2.7k',
    },
    {
      name: 'Leila Amin',
      what: 'Commercial',
      city: 'Cairo, Egypt',
      tag: 'Commercial',
      photo: 'studio portrait, single softbox',
      followers: '1.9k',
    },
    {
      name: 'Zola Mbeki',
      what: 'Runway',
      city: 'Cape Town',
      tag: 'Runway',
      photo: 'model turning at the end of the runway',
      followers: '3.6k',
    },
  ],
  actors: [
    {
      name: 'Kwame Boadu',
      what: 'Stage actor',
      city: 'Accra, Ghana',
      tag: 'Theatre',
      photo: 'actor mid-monologue, spotlight',
      followers: '1.4k',
    },
    {
      name: 'Sofia Marín',
      what: 'Screen actor',
      city: 'Mexico City',
      tag: 'Screen',
      photo: 'close-up from a short film',
      followers: '2.8k',
    },
    {
      name: 'Tunde Bakare',
      what: 'Screen actor',
      city: 'Ibadan, Nigeria',
      tag: 'Screen',
      photo: 'actor on set between takes',
      followers: '2.1k',
    },
    {
      name: 'Priya Nair',
      what: 'Theatre',
      city: 'London',
      tag: 'Theatre',
      photo: 'actor taking a bow, stage light',
      followers: '1.8k',
    },
  ],
  dancers: [
    {
      name: 'Maya Richards',
      what: 'Contemporary',
      city: 'London, UK',
      tag: 'Contemporary',
      photo: 'dancer mid-leap, single spotlight',
      followers: '9.4k',
    },
    {
      name: 'Seun Afolabi',
      what: 'Afro dance',
      city: 'Lagos, Nigeria',
      tag: 'Afro',
      photo: 'street cypher at dusk',
      followers: '6.1k',
    },
    {
      name: 'Aiko Tanaka',
      what: 'Ballet',
      city: 'Tokyo',
      tag: 'Ballet',
      photo: 'pointe work in the studio',
      followers: '4.3k',
    },
    {
      name: 'Jordan Lee',
      what: 'Hip hop',
      city: 'New York',
      tag: 'Hip hop',
      photo: 'freeze on a subway platform',
      followers: '3.9k',
    },
  ],
  artists: [
    {
      name: 'Zainab Yusuf',
      what: 'Painter',
      city: 'Abuja, Nigeria',
      tag: 'Painting',
      photo: 'painter at a large canvas',
      followers: '2.6k',
    },
    {
      name: 'Mateo Ruiz',
      what: 'Illustrator',
      city: 'Bogotá',
      tag: 'Illustration',
      photo: 'hands inking a page',
      followers: '1.9k',
    },
    {
      name: 'Esi Owusu',
      what: 'Sculptor',
      city: 'Accra, Ghana',
      tag: 'Sculpture',
      photo: 'carving wood',
      followers: '1.2k',
    },
    {
      name: 'Lina Haddad',
      what: 'Photographer',
      city: 'Beirut',
      tag: 'Photo',
      photo: 'photographer on a rooftop',
      followers: '3.4k',
    },
  ],
  creators: [
    {
      name: 'Dayo Adeyemi',
      what: 'Comedy',
      city: 'Lagos, Nigeria',
      tag: 'Comedy',
      photo: 'creator filming a sketch on a phone',
      followers: '8.7k',
    },
    {
      name: 'Noor Saleh',
      what: 'Fashion',
      city: 'Dubai',
      tag: 'Fashion',
      photo: 'outfit check in a market',
      followers: '5.5k',
    },
    {
      name: 'Ana Costa',
      what: 'Travel',
      city: 'Rio de Janeiro',
      tag: 'Travel',
      photo: 'creator on a hilltop at sunrise',
      followers: '4.2k',
    },
    {
      name: 'Yuki Sato',
      what: 'Food',
      city: 'Osaka',
      tag: 'Food',
      photo: 'chef plating at the counter',
      followers: '3.0k',
    },
  ],
};

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
        photo="Photo: sprinter leaving the blocks, golden hour"
        name="Tobi Adebayo"
        city="Ibadan, Nigeria"
      />
      <ShowcaseCard
        className="top-0 right-0 h-[17rem] w-[52%] sm:h-[15rem]"
        tag="Dancer · Contemporary"
        photo="Photo: dancer mid-leap under a single spotlight"
      />
      <ShowcaseCard
        className="right-[6%] bottom-0 h-[12rem] w-[44%] max-sm:hidden sm:h-[13.5rem]"
        tag="Musician"
        photo="Photo: vocalist at the mic"
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
  photo,
  name,
  city,
}: {
  readonly className: string;
  readonly tag: string;
  readonly photo: string;
  readonly name?: string;
  readonly city?: string;
}) {
  return (
    <div
      className={cn(
        'absolute overflow-hidden rounded-3xl border border-stage-ink/10 bg-stage-ink/5 shadow-lg',
        className,
      )}
    >
      <StagePlaceholder caption={photo} className="size-full bg-transparent" />
      <StageTag className="absolute top-3 left-3">{tag}</StageTag>
      {name ? (
        <span className="absolute bottom-4 left-4 grid">
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
              caption={`Photo: ${sample.photo}`}
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
    { name: 'Femi Oduya', what: 'Producer · Lagos · 3 videos', saved: true },
    { name: 'Bisi Lawal', what: 'Vocalist · Lagos · 5 videos', saved: false },
    { name: 'Kemi Ade', what: 'Vocalist · Ikeja · 2 videos', saved: false },
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
              <StagePlaceholder className="size-10 shrink-0 rounded-sm" />
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
