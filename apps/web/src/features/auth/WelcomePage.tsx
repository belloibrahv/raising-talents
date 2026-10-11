import {
  BadgeCheck,
  Camera,
  Clapperboard,
  Globe,
  Heart,
  ImagePlus,
  MapPin,
  Medal,
  Mic,
  Music,
  Palette,
  Search,
  ShieldCheck,
  Sparkles,
  UserPlus,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { Link } from 'react-router';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { LEGAL_URLS } from '../../shared/config';
import { BrandMark } from '../../shared/ui/BrandMark';

const DISCIPLINES = [
  { key: 'athletes', icon: Medal },
  { key: 'musicians', icon: Mic },
  { key: 'models', icon: Camera },
  { key: 'actors', icon: Clapperboard },
  { key: 'dancers', icon: Music },
  { key: 'creators', icon: Sparkles },
  { key: 'artists', icon: Palette },
] as const;

/** Places people will recognise from every continent. A flavour of "anywhere", not a list of where we are. */
const CITIES = [
  'Lagos',
  'London',
  'New York',
  'Mumbai',
  'São Paulo',
  'Nairobi',
  'Toronto',
  'Paris',
  'Dubai',
  'Seoul',
  'Johannesburg',
  'Sydney',
] as const;

const STEPS: readonly { key: 'post' | 'follow' | 'found'; icon: LucideIcon }[] = [
  { key: 'post', icon: ImagePlus },
  { key: 'follow', icon: UsersRound },
  { key: 'found', icon: Search },
];

const joinButton = cn(
  buttonVariants({ size: 'lg' }),
  'bg-brand-cta text-white no-underline shadow-lg shadow-primary/25 hover:opacity-95',
);
const signInButton = cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'no-underline');

/**
 * The front door. One screen says what this is: a place to post your work and be followed,
 * open to anyone in the world. The picture is the product itself, a post in a feed.
 */
export function WelcomePage() {
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    document.title = t('common.appName');
    heading.current?.focus();
  }, []);

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background text-foreground">
      {/* Soft colour behind the page: the brand as light, so the content stays simple. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-40 size-[36rem] rounded-full bg-brand opacity-20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-[28rem] -left-48 size-[30rem] rounded-full bg-brand-cta opacity-10 blur-3xl"
      />

      <header className="relative">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="flex items-center gap-2.5 font-display text-base font-bold whitespace-nowrap sm:text-lg">
            <BrandMark className="size-9" />
            {t('common.appName')}
          </span>
          <nav aria-label={t('titles.welcome')} className="flex items-center gap-2">
            <Link
              to="/sign-in"
              className="rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap text-foreground no-underline hover:bg-accent sm:px-4"
            >
              {t('welcome.signInShort')}
            </Link>
            <Link
              to="/sign-up"
              className={cn(buttonVariants({ size: 'sm' }), 'whitespace-nowrap no-underline')}
            >
              {t('welcome.join')}
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="relative">
        <section
          className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-8 pb-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-8 lg:pt-14 lg:pb-20"
          aria-labelledby="welcome-heading"
        >
          <div className="flex flex-col gap-6">
            <p className="inline-flex w-fit items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm font-medium shadow-xs">
              <Globe aria-hidden="true" className="size-4 text-primary" />
              {t('welcome.eyebrow')}
            </p>
            <h1
              id="welcome-heading"
              ref={heading}
              tabIndex={-1}
              className="text-5xl leading-[1.04] font-bold tracking-tight text-balance sm:text-6xl lg:text-7xl"
            >
              {t('welcome.headlineStart')}{' '}
              <span className="text-brand">{t('welcome.headlineEnd')}</span>
            </h1>
            <p className="max-w-xl text-lg text-pretty text-muted-foreground sm:text-xl">
              {t('welcome.body')}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link className={joinButton} to="/sign-up">
                {t('welcome.createAccount')}
              </Link>
              <Link className={signInButton} to="/sign-in">
                {t('welcome.signIn')}
              </Link>
            </div>
            <p className="m-0 text-sm text-muted-foreground">{t('welcome.free')}</p>
          </div>
          <FeedPreview />
        </section>

        <section className="border-y bg-card/60" aria-labelledby="world-heading">
          <div className="mx-auto grid max-w-6xl gap-4 px-4 py-8 text-center sm:px-6">
            <h2 id="world-heading" className="text-base font-semibold">
              {t('welcome.world')}
            </h2>
            <ul className="m-0 flex list-none flex-wrap justify-center gap-2 p-0">
              {CITIES.map((city) => (
                <li
                  key={city}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-sm font-medium"
                >
                  <MapPin aria-hidden="true" className="size-3.5 text-primary" />
                  {city}
                </li>
              ))}
              <li className="inline-flex items-center rounded-full px-2 py-1.5 text-sm text-muted-foreground">
                {t('welcome.worldMore')}
              </li>
            </ul>
          </div>
        </section>

        <section
          className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 sm:py-20"
          aria-labelledby="steps-heading"
        >
          <h2 id="steps-heading" className="text-center text-3xl font-bold sm:text-4xl">
            {t('welcome.steps.title')}
          </h2>
          <ol className="m-0 grid list-none gap-4 p-0 sm:grid-cols-3">
            {STEPS.map(({ key, icon: Icon }) => (
              <li key={key} className="grid gap-3 rounded-3xl border bg-card p-6 shadow-xs">
                <span className="grid size-12 place-items-center rounded-2xl bg-brand text-white">
                  <Icon aria-hidden="true" className="size-6" />
                </span>
                <h3 className="text-xl font-semibold">{t(`welcome.steps.${key}`)}</h3>
                <p className="m-0 text-muted-foreground">{t(`welcome.steps.${key}Body`)}</p>
              </li>
            ))}
          </ol>
          <ul
            className="m-0 flex list-none flex-wrap justify-center gap-2 p-0"
            aria-label={t('welcome.disciplinesLabel')}
          >
            {DISCIPLINES.map(({ key, icon: Icon }) => (
              <li
                key={key}
                className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground"
              >
                <Icon aria-hidden="true" className="size-4" />
                {t(`welcome.disciplines.${key}`)}
              </li>
            ))}
          </ul>
          <p className="mx-auto flex max-w-2xl items-start gap-3 rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
            <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
            {t('welcome.safe')}
          </p>
          <div className="flex justify-center">
            <Link className={joinButton} to="/sign-up">
              {t('welcome.createAccount')}
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="flex items-center gap-2 font-semibold text-foreground">
            <BrandMark className="size-6" />
            {t('common.appName')}
          </span>
          <span>{t('welcome.footer.made')}</span>
          <span className="flex gap-4">
            <a href={LEGAL_URLS.terms} target="_blank" rel="noreferrer">
              {t('welcome.footer.terms')}
            </a>
            <a href={LEGAL_URLS.guidelines} target="_blank" rel="noreferrer">
              {t('welcome.footer.guidelines')}
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}

/** A face drawn with shapes: no photos of real people on a page everyone sees. */
function Face({ tone, className }: { readonly tone: string; readonly className?: string }) {
  return (
    <span
      className={cn(
        'relative block overflow-hidden rounded-full bg-gradient-to-br',
        tone,
        className,
      )}
    >
      <span className="absolute top-[22%] left-1/2 size-[38%] -translate-x-1/2 rounded-full bg-black/25" />
      <span className="absolute -bottom-[18%] left-1/2 h-[52%] w-[78%] -translate-x-1/2 rounded-t-full bg-black/25" />
    </span>
  );
}

const PEOPLE = [
  { name: 'Ngozi', place: 'Lagos', tone: 'from-amber-300 to-rose-600' },
  { name: 'Jordan', place: 'New York', tone: 'from-lime-300 to-emerald-700' },
  { name: 'Aiko', place: 'Seoul', tone: 'from-sky-300 to-indigo-700' },
  { name: 'Lucas', place: 'São Paulo', tone: 'from-fuchsia-300 to-purple-800' },
  { name: 'Amara', place: 'Nairobi', tone: 'from-teal-300 to-cyan-700' },
] as const;

/** What the product looks like, drawn in HTML: a post in the feed, a new follower, people far apart. */
function FeedPreview() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-sm select-none">
      <div className="overflow-hidden rounded-[2rem] border bg-card shadow-2xl">
        <div className="flex justify-between gap-2 overflow-hidden border-b px-4 py-3">
          {PEOPLE.map((person) => (
            <span key={person.name} className="grid w-14 shrink-0 justify-items-center gap-1">
              <span className="rounded-full ring-brand">
                <Face tone={person.tone} className="size-11" />
              </span>
              <span className="w-full truncate text-center text-[11px] text-muted-foreground">
                {person.place}
              </span>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="rounded-full ring-brand">
            <Face tone="from-orange-300 to-pink-600" className="size-9" />
          </span>
          <span className="grid flex-1">
            <span className="flex items-center gap-1 text-sm font-semibold">
              Maya R.
              <BadgeCheck className="size-4 text-success" />
            </span>
            <span className="text-xs text-muted-foreground">{t('welcome.preview.role')}</span>
          </span>
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
            {t('social.follow')}
          </span>
        </div>
        <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-orange-300 via-pink-500 to-violet-700">
          <span className="absolute top-[20%] left-1/2 size-28 -translate-x-1/2 rounded-full bg-black/25" />
          <span className="absolute -bottom-8 left-1/2 h-48 w-64 -translate-x-1/2 rounded-t-full bg-black/25" />
        </div>
        <div className="grid gap-1 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <Heart className="size-5 fill-like text-like" />
            {t('welcome.preview.likes')}
          </span>
          <span className="text-sm">
            <span className="font-semibold">Maya R.</span> {t('welcome.preview.caption')}
          </span>
        </div>
      </div>

      <div className="absolute top-48 -left-3 flex items-center gap-2.5 rounded-2xl border bg-card px-3 py-2.5 shadow-xl sm:-left-16">
        <span className="grid size-9 place-items-center rounded-full bg-accent text-accent-foreground">
          <UserPlus className="size-4" />
        </span>
        <span className="grid text-xs">
          <span className="font-semibold">{t('welcome.preview.follower')}</span>
          <span className="text-muted-foreground">{t('welcome.preview.followerFrom')}</span>
        </span>
      </div>
      <div className="absolute -right-2 bottom-28 flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs font-semibold shadow-xl sm:-right-10">
        <Heart className="size-4 fill-like text-like" />
        {t('welcome.preview.liked')}
      </div>
    </div>
  );
}
