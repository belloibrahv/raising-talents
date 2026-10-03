import {
  BadgeCheck,
  Camera,
  Check,
  Clapperboard,
  EyeOff,
  Hand,
  Medal,
  Mic,
  Search,
  ShieldCheck,
  Sparkles,
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
  { key: 'creators', icon: Sparkles },
] as const;

const spotlightButton = cn(
  buttonVariants({ variant: 'spotlight', size: 'lg' }),
  'no-underline shadow-lg shadow-spotlight/20',
);
const ghostOnStage = cn(
  buttonVariants({ variant: 'outline', size: 'lg' }),
  'border-stage-foreground/40 bg-transparent text-stage-foreground no-underline hover:bg-stage-foreground/10 hover:text-stage-foreground',
);

/**
 * The front door. A visitor should understand in one screen what this is, who it is for and
 * why it is safe, then find the way in from anywhere on the page.
 */
export function WelcomePage() {
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => {
    document.title = t('common.appName');
    heading.current?.focus();
  }, []);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="bg-stage text-stage-foreground">
        <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="flex items-center gap-2.5 font-display text-base font-bold whitespace-nowrap sm:text-lg">
            <BrandMark className="size-9 ring-1 ring-spotlight/50" />
            {t('common.appName')}
          </span>
          <nav aria-label={t('titles.welcome')} className="flex items-center gap-2">
            <Link
              to="/sign-in"
              className="rounded-full px-3 py-2 text-sm font-semibold whitespace-nowrap text-stage-foreground no-underline hover:bg-stage-foreground/10 sm:px-4"
            >
              {t('welcome.signInShort')}
            </Link>
            <Link
              to="/sign-up"
              className={cn(
                buttonVariants({ variant: 'spotlight', size: 'sm' }),
                'whitespace-nowrap no-underline',
              )}
            >
              {t('welcome.join')}
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        <section
          className="relative overflow-hidden bg-stage text-stage-foreground [background-image:radial-gradient(ellipse_60%_55%_at_75%_0%,rgb(255_201_60/0.30),transparent_70%),radial-gradient(ellipse_50%_40%_at_0%_100%,rgb(142_162_255/0.18),transparent_70%)]"
          aria-labelledby="welcome-heading"
        >
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-8 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-16 lg:pb-28">
            <div className="flex flex-col gap-6">
              <p className="inline-flex w-fit items-center gap-2 rounded-full border border-stage-foreground/20 bg-stage-foreground/5 px-3 py-1 text-sm font-medium text-stage-foreground/90">
                <span className="size-2 rounded-full bg-spotlight" aria-hidden="true" />
                {t('welcome.eyebrow')}
              </p>
              <h1
                id="welcome-heading"
                ref={heading}
                tabIndex={-1}
                className="text-5xl leading-[1.02] font-bold tracking-tight text-balance sm:text-6xl lg:text-7xl"
              >
                {t('welcome.headline')}
              </h1>
              <p className="max-w-xl text-lg text-pretty text-stage-foreground/80 sm:text-xl">
                {t('welcome.body')}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link className={spotlightButton} to="/sign-up">
                  {t('welcome.createAccount')}
                </Link>
                <Link className={ghostOnStage} to="/sign-in">
                  {t('welcome.signIn')}
                </Link>
              </div>
              <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-sm text-stage-foreground/80">
                {(['verified', 'control', 'free'] as const).map((key) => (
                  <li key={key} className="inline-flex items-center gap-1.5">
                    <Check aria-hidden="true" className="size-4 text-spotlight" />
                    {t(`welcome.trust.${key}`)}
                  </li>
                ))}
              </ul>
            </div>
            <ProductPreview />
          </div>
        </section>

        <section className="border-b bg-muted/40" aria-label={t('welcome.disciplinesLabel')}>
          <ul className="mx-auto flex max-w-6xl list-none flex-wrap justify-center gap-3 px-4 py-6 sm:px-6">
            {DISCIPLINES.map(({ key, icon: Icon }) => (
              <li
                key={key}
                className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-semibold shadow-xs"
              >
                <Icon aria-hidden="true" className="size-4 text-foreground" />
                {t(`welcome.disciplines.${key}`)}
              </li>
            ))}
          </ul>
        </section>

        <Sides />
        <HowItWorks />
        <Safety />

        <section className="px-4 py-20 sm:px-6">
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 rounded-[2rem] bg-stage px-6 py-14 text-center text-stage-foreground [background-image:radial-gradient(ellipse_70%_80%_at_50%_0%,rgb(255_201_60/0.28),transparent_70%)] sm:px-12">
            <h2 className="max-w-2xl text-3xl font-bold text-balance sm:text-5xl">
              {t('welcome.cta.title')}
            </h2>
            <p className="text-lg text-stage-foreground/80">{t('welcome.cta.body')}</p>
            <Link className={spotlightButton} to="/sign-up">
              {t('welcome.createAccount')}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t">
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

/** What the product looks like, drawn in HTML: search results and a request arriving. */
function ProductPreview() {
  const cards = [
    {
      name: 'Ngozi A.',
      role: 'Singer · Lagos',
      tone: 'from-amber-300 to-rose-700',
      verified: true,
    },
    {
      name: 'Emeka O.',
      role: 'Dancer · Lagos',
      tone: 'from-sky-300 to-indigo-800',
      verified: false,
    },
    {
      name: 'Zainab B.',
      role: 'Model · Abuja',
      tone: 'from-fuchsia-300 to-purple-900',
      verified: true,
    },
    {
      name: 'Tobi A.',
      role: 'Sprinter · Ibadan',
      tone: 'from-lime-300 to-emerald-800',
      verified: false,
    },
  ];
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-md select-none lg:max-w-none">
      <div className="rounded-3xl border border-stage-foreground/15 bg-stage-foreground/[0.06] p-4 shadow-2xl backdrop-blur sm:p-5">
        <div className="flex items-center gap-2 rounded-full bg-stage-foreground/10 px-4 py-2.5 text-sm text-stage-foreground/90">
          <Search className="size-4" />
          {t('welcome.preview.searching')}
          <span className="ml-auto text-xs text-stage-foreground/60">
            {t('welcome.preview.found')}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 pb-4">
          {cards.map((card, index) => (
            <div
              key={card.name}
              className={cn(
                'overflow-hidden rounded-2xl bg-stage-foreground/10',
                index % 2 === 1 && 'translate-y-4',
              )}
            >
              <div className={cn('relative aspect-[4/5] bg-gradient-to-br', card.tone)}>
                <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/40 to-transparent" />
                <div className="absolute bottom-[18%] left-1/2 size-16 -translate-x-1/2 rounded-full bg-black/25 sm:size-20" />
                <div className="absolute -bottom-6 left-1/2 h-16 w-32 -translate-x-1/2 rounded-t-full bg-black/25 sm:w-36" />
                {card.verified ? (
                  <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                    <BadgeCheck className="size-3" />
                    {t('talent.verified')}
                  </span>
                ) : null}
              </div>
              <div className="px-3 py-2.5">
                <p className="m-0 text-sm font-semibold">{card.name}</p>
                <p className="m-0 text-xs text-stage-foreground/65">{card.role}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="absolute -bottom-8 left-1/2 w-[88%] -translate-x-1/2 rounded-2xl bg-white p-4 text-[#1c1a3d] shadow-2xl ring-1 ring-black/5 sm:-left-8 sm:w-80 sm:translate-x-0 lg:-left-12">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1c1a3d] text-white">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="m-0 text-sm leading-snug font-bold">{t('welcome.preview.request')}</p>
            <p className="m-0 mt-0.5 text-xs text-[#5e5b78]">{t('welcome.preview.requestBody')}</p>
          </div>
        </div>
        <span className="mt-3 flex h-9 items-center justify-center rounded-full bg-[#ffc93c] text-sm font-bold">
          {t('welcome.preview.accept')}
        </span>
      </div>
    </div>
  );
}

function Sides() {
  const sides = [
    {
      title: t('welcome.sides.talentTitle'),
      body: t('welcome.sides.talentBody'),
      points: [t('welcome.sides.talent1'), t('welcome.sides.talent2'), t('welcome.sides.talent3')],
      cta: t('welcome.sides.talentCta'),
      icon: Sparkles,
      tone: 'bg-spotlight text-spotlight-foreground',
    },
    {
      title: t('welcome.sides.agentTitle'),
      body: t('welcome.sides.agentBody'),
      points: [t('welcome.sides.agent1'), t('welcome.sides.agent2'), t('welcome.sides.agent3')],
      cta: t('welcome.sides.agentCta'),
      icon: Search,
      tone: 'bg-stage text-stage-foreground',
    },
  ];
  return (
    <section className="px-4 py-20 sm:px-6" aria-labelledby="sides-heading">
      <div className="mx-auto max-w-6xl">
        <h2 id="sides-heading" className="text-center text-3xl font-bold sm:text-4xl">
          {t('welcome.sides.title')}
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {sides.map(({ title, body, points, cta, icon: Icon, tone }) => (
            <article
              key={title}
              className="flex flex-col gap-5 rounded-3xl border bg-card p-7 shadow-sm sm:p-9"
            >
              <span className={cn('grid size-12 place-items-center rounded-2xl', tone)}>
                <Icon aria-hidden="true" className="size-6" />
              </span>
              <div className="grid gap-2">
                <h3 className="text-2xl font-bold">{title}</h3>
                <p className="m-0 text-muted-foreground">{body}</p>
              </div>
              <ul className="m-0 grid list-none gap-3 p-0">
                {points.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
                    {point}
                  </li>
                ))}
              </ul>
              <Link
                className={cn(buttonVariants({ variant: 'outline' }), 'mt-auto w-fit no-underline')}
                to="/sign-up"
              >
                {cta}
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [1, 2, 3] as const;
  return (
    <section className="bg-muted/50 px-4 py-20 sm:px-6" aria-labelledby="how-heading">
      <div className="mx-auto max-w-6xl">
        <h2 id="how-heading" className="text-center text-3xl font-bold sm:text-4xl">
          {t('welcome.how.title')}
        </h2>
        <ol className="m-0 mt-10 grid list-none gap-6 p-0 md:grid-cols-3">
          {steps.map((step) => (
            <li key={step} className="flex flex-col gap-3 rounded-3xl bg-card p-7 shadow-xs">
              <span className="grid size-10 place-items-center rounded-full bg-stage font-display text-lg font-bold text-spotlight">
                {step}
              </span>
              <h3 className="text-xl font-bold">{t(`welcome.how.step${step}`)}</h3>
              <p className="m-0 text-muted-foreground">{t(`welcome.how.step${step}Body`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Safety() {
  const points: { key: 'verified' | 'control' | 'private'; icon: LucideIcon }[] = [
    { key: 'verified', icon: BadgeCheck },
    { key: 'control', icon: Hand },
    { key: 'private', icon: EyeOff },
  ];
  return (
    <section className="px-4 py-20 sm:px-6" aria-labelledby="safety-heading">
      <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
        <div className="grid gap-4">
          <span className="grid size-12 place-items-center rounded-2xl bg-success-surface text-success">
            <ShieldCheck aria-hidden="true" className="size-6" />
          </span>
          <h2 id="safety-heading" className="text-3xl font-bold text-balance sm:text-4xl">
            {t('welcome.safety.title')}
          </h2>
          <p className="m-0 text-lg text-muted-foreground">{t('welcome.safety.body')}</p>
        </div>
        <ul className="m-0 grid list-none gap-4 p-0">
          {points.map(({ key, icon: Icon }) => (
            <li key={key} className="flex items-start gap-4 rounded-2xl border bg-card p-5">
              <Icon aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-foreground" />
              <div className="grid gap-1">
                <h3 className="text-lg font-semibold">{t(`welcome.safety.${key}`)}</h3>
                <p className="m-0 text-muted-foreground">{t(`welcome.safety.${key}Body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
