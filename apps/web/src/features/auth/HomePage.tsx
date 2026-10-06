import type { ConversationSummary } from '@rt/contracts';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Clock3,
  Eye,
  ImagePlus,
  Lightbulb,
  MessagesSquare,
  PenLine,
  Search,
} from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { buttonLink } from '../../shared/ui/Button';
import { PageSkeleton } from '../../shared/ui/PageSkeleton';
import { Page } from '../../shared/ui/Page';
import { counterpartName, CounterpartAvatar, statusLabel } from '../messages/Counterpart';
import { useConversations, useMessagingUnread } from '../messages/queries';
import { shortTime } from '../messages/time';
import { useMyPortfolio } from '../portfolio/queries';
import { useMyAgentProfile, useMyTalentProfile, useTaxonomy } from '../profile/queries';
import { VerificationCard } from '../profile/VerificationCard';
import { useShortlist } from '../shortlist/queries';
import { ShareCard } from '../talents/ShareCard';
import { useSession } from './use-auth';

/** The signed-in start: finishes onboarding first, then a dashboard for each role. */
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

const stageCard =
  'relative overflow-hidden rounded-3xl bg-stage p-6 text-stage-foreground shadow-lg [background-image:radial-gradient(ellipse_70%_90%_at_90%_0%,rgb(255_201_60/0.32),transparent_65%)] sm:p-8';
const onStageButton =
  'inline-flex h-10 items-center gap-2 rounded-full bg-stage-foreground/10 px-4 text-sm font-semibold text-stage-foreground no-underline ring-1 ring-stage-foreground/20 transition-colors hover:bg-stage-foreground/20';

function SectionHeading({
  id,
  title,
  to,
  action,
}: {
  readonly id: string;
  readonly title: string;
  readonly to?: string;
  readonly action?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 id={id} className="text-xl font-bold">
        {title}
      </h2>
      {to && action ? (
        <Link
          to={to}
          className="inline-flex items-center gap-1 text-sm font-semibold text-foreground no-underline hover:underline"
        >
          {action}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}

function TalentHome() {
  const profile = useMyTalentProfile();
  const portfolio = useMyPortfolio();
  if (profile.isPending) return <PageSkeleton />;
  const data = profile.data;
  const discipline = [data?.subcategories[0]?.name ?? data?.category?.name, data?.city?.name]
    .filter(Boolean)
    .join(' · ');
  const items = portfolio.data?.items ?? [];
  const shown = items.filter((item) => item.urls).slice(0, 4);
  return (
    <Page
      title={t('home.talentReadyTitle', { name: data?.displayName ?? '' })}
      documentTitle={t('titles.home')}
      width="wide"
      className="[&>div]:max-w-4xl"
      titleClassName="sr-only"
    >
      <section className={stageCard} aria-label={data?.displayName ?? t('titles.home')}>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          {data?.avatarUrls ? (
            <img
              className="size-24 shrink-0 rounded-full object-cover ring-4 ring-spotlight/70 sm:size-28"
              src={data.avatarUrls.medium}
              alt=""
            />
          ) : (
            <span
              aria-hidden="true"
              className="grid size-24 shrink-0 place-items-center rounded-full bg-stage-foreground/10 font-display text-4xl font-bold ring-4 ring-spotlight/70 sm:size-28"
            >
              {data?.displayName?.slice(0, 1)}
            </span>
          )}
          <div className="grid min-w-0 gap-1">
            <p className="m-0 text-sm font-medium text-stage-foreground/70">{t('home.greeting')}</p>
            <p className="m-0 font-display text-3xl font-bold sm:text-4xl" aria-hidden="true">
              {data?.displayName}
            </p>
            {discipline ? <p className="m-0 text-stage-foreground/80">{discipline}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {data ? (
                <Link className={onStageButton} to={`/talents/${data.handle}`}>
                  <Eye aria-hidden="true" className="size-4" />
                  {t('home.publicProfile')}
                </Link>
              ) : null}
              <Link className={onStageButton} to="/onboarding/talent/about">
                <PenLine aria-hidden="true" className="size-4" />
                {t('home.editProfile')}
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Attention />

      {data?.photoInReview ? (
        <p className="flex items-start gap-3 rounded-2xl border bg-card p-4 text-sm">
          <Clock3 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <span>
            <span className="block font-semibold">{t('home.photoInReview')}</span>
            {t('home.photoInReviewBody')}
          </span>
        </p>
      ) : data && !data.avatarUrls ? (
        <Link
          to="/onboarding/talent/photo"
          className="flex items-center gap-3 rounded-2xl border-2 border-destructive/40 bg-destructive-surface p-4 text-sm text-foreground no-underline"
        >
          <ImagePlus aria-hidden="true" className="size-5 shrink-0 text-destructive" />
          <span className="flex-1">
            <span className="block font-semibold">{t('home.photoNeeded')}</span>
            {t('home.photoNeededBody')}
          </span>
          <ArrowRight aria-hidden="true" className="size-5" />
        </Link>
      ) : null}

      {data ? <ShareCard profile={data} /> : null}

      <section className="stack gap-4" aria-labelledby="portfolio-heading">
        <SectionHeading
          id="portfolio-heading"
          title={t('home.yourPortfolio')}
          to="/portfolio"
          action={t('home.managePortfolio')}
        />
        {portfolio.data ? (
          <p className="-mt-2 text-sm text-muted-foreground">
            {t('home.portfolioCount', { count: items.length, max: portfolio.data.maxItems })}
          </p>
        ) : null}
        <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-5 sm:gap-3">
          {shown.map((item) => (
            <li key={item.id}>
              <img
                className="aspect-[4/5] w-full rounded-2xl bg-muted object-cover"
                src={item.urls?.small}
                alt={item.caption}
                loading="lazy"
                decoding="async"
              />
            </li>
          ))}
          <li>
            <Link
              to="/portfolio"
              className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-input p-3 text-center text-sm font-semibold text-foreground no-underline transition-colors hover:bg-accent"
            >
              <ImagePlus aria-hidden="true" className="size-7" />
              {t('home.addWork')}
            </Link>
          </li>
        </ul>
        {portfolio.data && items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('home.portfolioEmpty')}</p>
        ) : null}
      </section>

      <RecentConversations emptyText={t('home.noMessagesTalent')} />

      <p className="flex items-start gap-3 rounded-2xl bg-spotlight/15 p-4 text-sm">
        <Lightbulb aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        {t('home.tip')}
      </p>
    </Page>
  );
}

/** A loud card when someone is waiting for an answer, and nothing otherwise. */
function Attention() {
  const waiting = useMessagingUnread(true).data?.unread ?? 0;
  if (waiting === 0) return null;
  return (
    <Link
      to="/messages"
      className="group flex items-center gap-4 rounded-2xl border-2 border-spotlight bg-spotlight/15 p-5 text-foreground no-underline transition-colors hover:bg-spotlight/25"
    >
      <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-spotlight text-spotlight-foreground">
        <MessagesSquare aria-hidden="true" className="size-6" />
        <span
          aria-hidden="true"
          className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-destructive ring-2 ring-background"
        />
      </span>
      <span className="grid flex-1 gap-0.5">
        <span className="text-lg font-bold">{t('home.attention', { count: waiting })}</span>
        <span className="text-sm text-muted-foreground">{t('home.attentionBody')}</span>
      </span>
      <ArrowRight
        aria-hidden="true"
        className="size-5 transition-transform group-hover:translate-x-1"
      />
    </Link>
  );
}

function RecentConversations({ emptyText }: { readonly emptyText: string }) {
  const conversations = useConversations();
  const items = conversations.data?.pages[0]?.items.slice(0, 3) ?? [];
  return (
    <section className="stack gap-4" aria-labelledby="recent-heading">
      <SectionHeading
        id="recent-heading"
        title={t('home.recentMessages')}
        to="/messages"
        action={t('home.seeAll')}
      />
      {conversations.isSuccess && items.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="m-0 list-none divide-y overflow-hidden rounded-2xl border bg-card p-0 shadow-xs">
          {items.map((conversation) => (
            <li key={conversation.id}>
              <ConversationLine conversation={conversation} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ConversationLine({ conversation }: { readonly conversation: ConversationSummary }) {
  const status = statusLabel(conversation);
  const needsMe = conversation.awaitingMyAnswer || conversation.unread > 0;
  return (
    <Link
      to={`/messages/${conversation.id}`}
      className="flex items-center gap-3 p-4 text-card-foreground no-underline transition-colors hover:bg-accent/60"
    >
      <CounterpartAvatar counterpart={conversation.counterpart} />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className={cn('truncate', needsMe ? 'font-bold' : 'font-semibold')}>
          {counterpartName(conversation.counterpart)}
        </span>
        <span className="truncate text-sm text-muted-foreground">
          {status ? `${status} · ` : ''}
          {conversation.lastMessage?.body}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-xs text-muted-foreground">{shortTime(conversation.updatedAt)}</span>
        {needsMe ? (
          <span aria-hidden="true" className="size-2.5 rounded-full bg-destructive" />
        ) : null}
      </span>
    </Link>
  );
}

function AgentHome() {
  const profile = useMyAgentProfile();
  const taxonomy = useTaxonomy();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  if (profile.isPending) return <PageSkeleton />;
  const data = profile.data;
  return (
    <Page
      title={t('home.agentTitle', { name: data?.agencyName ?? '' })}
      documentTitle={t('titles.home')}
      width="wide"
      className="[&>div]:max-w-5xl"
      titleClassName="sr-only"
    >
      <section className={stageCard} aria-labelledby="agent-hero">
        <div className="grid gap-5">
          <div className="flex flex-wrap items-center gap-2 text-sm text-stage-foreground/80">
            <Building2 aria-hidden="true" className="size-4" />
            <span className="font-semibold text-stage-foreground">{data?.agencyName}</span>
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold',
                data?.verified
                  ? 'bg-success-surface text-success'
                  : 'bg-spotlight text-spotlight-foreground',
              )}
            >
              {data?.verified ? (
                <BadgeCheck aria-hidden="true" className="size-3.5" />
              ) : (
                <Clock3 aria-hidden="true" className="size-3.5" />
              )}
              {data?.verified ? t('home.verifiedChip') : t('home.pendingChip')}
            </span>
          </div>
          <div className="grid gap-2">
            <h2 id="agent-hero" className="text-3xl font-bold sm:text-5xl">
              {t('home.agentHero')}
            </h2>
            <p className="m-0 text-stage-foreground/80 sm:text-lg">{t('home.agentHeroBody')}</p>
          </div>
          <form
            role="search"
            className="flex flex-col gap-2 rounded-3xl bg-white p-2 shadow-xl sm:flex-row sm:rounded-full"
            onSubmit={(event: SubmitEvent) => {
              event.preventDefault();
              const q = query.trim();
              void navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
            }}
          >
            <label className="sr-only" htmlFor="home-search">
              {t('home.searchLabel')}
            </label>
            <span className="flex flex-1 items-center gap-2 px-4">
              <Search aria-hidden="true" className="size-5 text-[#5e5b78]" />
              <input
                id="home-search"
                type="search"
                enterKeyHint="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
                placeholder={t('home.searchPlaceholder')}
                className="h-12 w-full bg-transparent text-base text-[#1c1a3d] outline-none placeholder:text-[#5e5b78]"
                maxLength={100}
              />
            </span>
            <button
              type="submit"
              className="h-12 cursor-pointer rounded-full bg-[#1c1a3d] px-7 font-semibold text-white transition-opacity hover:opacity-90"
            >
              {t('home.findTalent')}
            </button>
          </form>
        </div>
      </section>

      {data && !data.verified ? <VerificationCard /> : null}

      <section className="stack gap-4" aria-labelledby="browse-heading">
        <SectionHeading id="browse-heading" title={t('home.browse')} />
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {(taxonomy.data?.categories ?? []).map((category) => (
            <li key={category.slug}>
              <Link
                to={`/search?category=${category.slug}`}
                className="inline-flex h-11 items-center rounded-full border bg-card px-5 text-sm font-semibold text-foreground no-underline shadow-xs transition-colors hover:border-input hover:bg-accent"
              >
                {category.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <RecentConversations emptyText={t('home.noMessagesAgent')} />
        <ShortlistPreview />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link className={buttonLink('secondary', 'sm')} to="/onboarding/agent">
          <PenLine aria-hidden="true" />
          {t('home.editProfile')}
        </Link>
      </div>
    </Page>
  );
}

function ShortlistPreview() {
  const shortlist = useShortlist();
  const items = shortlist.data?.pages[0]?.items.slice(0, 4) ?? [];
  return (
    <section className="stack gap-4" aria-labelledby="shortlist-heading">
      <SectionHeading
        id="shortlist-heading"
        title={t('home.yourShortlist')}
        to="/shortlist"
        action={t('home.seeAll')}
      />
      {shortlist.isSuccess && items.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
          {t('home.shortlistEmpty')}
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="m-0 grid list-none grid-cols-4 gap-3 p-0">
          {items.map(({ talent }) => (
            <li key={talent.handle}>
              <Link to={`/talents/${talent.handle}`} className="group grid gap-1.5 no-underline">
                {talent.avatarUrls ? (
                  <img
                    className="aspect-[4/5] w-full rounded-xl bg-muted object-cover transition-transform group-hover:scale-[1.03]"
                    src={talent.avatarUrls.small}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid aspect-[4/5] w-full place-items-center rounded-xl bg-stage font-display text-2xl font-bold text-stage-foreground"
                  >
                    {talent.displayName.slice(0, 1)}
                  </span>
                )}
                <span className="truncate text-xs font-semibold text-foreground">
                  {talent.displayName}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
