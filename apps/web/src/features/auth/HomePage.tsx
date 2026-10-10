import type { ConversationSummary, FeedScope } from '@rt/contracts';
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Compass,
  ImagePlus,
  MessagesSquare,
  PenLine,
  Search,
  UsersRound,
} from 'lucide-react';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { placeLabel } from '../../shared/places';
import { Avatar } from '../../shared/ui/Avatar';
import { Button, buttonLink } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { counterpartName, CounterpartAvatar, statusLabel } from '../messages/Counterpart';
import { useConversations, useMessagingUnread } from '../messages/queries';
import { shortTime } from '../messages/time';
import { categoryIcon } from '../profile/category-icons';
import { useMyAgentProfile, useMyTalentProfile, useTaxonomy } from '../profile/queries';
import { VerificationCard } from '../profile/VerificationCard';
import { PostCard } from '../social/PostCard';
import { useFeed, useTalentSocial } from '../social/queries';
import { SuggestionRail } from '../social/SuggestionRail';
import { useSession } from './use-auth';

/** The signed-in start: finishes onboarding first, then the feed. */
export function HomePage() {
  const me = useSession().me;
  if (me?.status === 'onboarding') {
    return (
      <Navigate to={me.role === 'agent' ? '/onboarding/agent' : '/onboarding/talent'} replace />
    );
  }
  if (me?.role === 'moderator' || me?.role === 'admin')
    return <Navigate to="/moderation" replace />;
  const agent = me?.role === 'agent';
  return (
    <Page
      title={t('home.title')}
      documentTitle={t('titles.home')}
      width="wide"
      className="px-0 pt-0 sm:px-6 sm:pt-2 [&>div]:max-w-5xl"
      titleClassName="sr-only"
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,36rem)_minmax(0,1fr)] lg:items-start lg:gap-12">
        <div className="grid gap-6">
          <div className="grid gap-4 px-4 empty:hidden sm:px-0">
            <Attention />
            {agent ? <AgentNotices /> : <TalentNotices />}
          </div>
          {agent ? <SearchStart /> : <ShareStart />}
          <SuggestionRail />
          <Feed />
        </div>
        <aside className="hidden gap-6 lg:sticky lg:top-24 lg:grid" aria-label={t('home.aside')}>
          {agent ? <AgentCard /> : <TalentCard />}
          <Categories />
          <RecentConversations
            emptyText={agent ? t('home.noMessagesAgent') : t('home.noMessagesTalent')}
          />
        </aside>
      </div>
    </Page>
  );
}

const SCOPES: readonly { scope: FeedScope; label: () => string }[] = [
  { scope: 'discover', label: () => t('home.forYou') },
  { scope: 'following', label: () => t('home.following') },
];

/** Work from everyone, or only from talent you follow. More loads as the end comes into view. */
function Feed() {
  const [scope, setScope] = useState<FeedScope>('discover');
  const feed = useFeed(scope);
  const posts = feed.data?.pages.flatMap((page) => page.items) ?? [];
  const end = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;

  useEffect(() => {
    const marker = end.current;
    if (!marker || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '600px' },
    );
    observer.observe(marker);
    return () => {
      observer.disconnect();
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  return (
    <section className="grid gap-4" aria-labelledby="feed-heading">
      <h2 id="feed-heading" className="sr-only">
        {t('home.feed')}
      </h2>
      <div
        role="group"
        aria-label={t('home.feedChoice')}
        className="mx-4 grid grid-cols-2 rounded-full bg-muted p-1 sm:mx-0"
      >
        {SCOPES.map((entry) => (
          <button
            key={entry.scope}
            type="button"
            aria-pressed={scope === entry.scope}
            className={cn(
              'h-10 cursor-pointer rounded-full text-sm font-semibold text-muted-foreground transition-colors',
              scope === entry.scope && 'bg-background text-foreground shadow-sm',
            )}
            onClick={() => {
              setScope(entry.scope);
            }}
          >
            {entry.label()}
          </button>
        ))}
      </div>
      <FormMessage tone="error">{feed.error ? errorMessage(feed.error) : null}</FormMessage>
      {feed.isPending ? <FeedSkeleton /> : null}
      {feed.isSuccess && posts.length === 0 ? (
        <div className="px-4 sm:px-0">
          {scope === 'following' ? (
            <EmptyState
              icon={UsersRound}
              title={t('home.followingEmpty')}
              description={t('home.followingEmptyBody')}
            >
              <Link className={buttonLink('primary', 'sm')} to="/search">
                <Compass aria-hidden="true" />
                {t('home.explore')}
              </Link>
            </EmptyState>
          ) : (
            <EmptyState
              icon={ImagePlus}
              title={t('home.feedEmpty')}
              description={t('home.feedEmptyBody')}
            />
          )}
        </div>
      ) : null}
      <ul className="m-0 grid list-none gap-4 p-0 sm:gap-6" aria-busy={feed.isFetching}>
        {posts.map((post, index) => (
          <li key={post.id}>
            <PostCard post={post} eager={index === 0} />
          </li>
        ))}
      </ul>
      <div ref={end} />
      {hasNextPage ? (
        <Button
          variant="secondary"
          className="mx-4 sm:mx-0"
          loading={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {t('home.morePosts')}
        </Button>
      ) : null}
    </section>
  );
}

function FeedSkeleton() {
  return (
    <div className="grid gap-4" aria-hidden="true">
      {[0, 1].map((index) => (
        <div key={index} className="grid gap-3 border-y bg-card p-4 sm:rounded-2xl sm:border">
          <div className="flex items-center gap-3">
            <div className="size-11 animate-pulse rounded-full bg-muted" />
            <div className="grid flex-1 gap-2">
              <div className="h-3.5 w-36 animate-pulse rounded-full bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
            </div>
          </div>
          <div className="aspect-[4/5] w-full animate-pulse rounded-xl bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** Where a talent starts a post: their face and one clear action. */
function ShareStart() {
  const profile = useMyTalentProfile().data;
  return (
    <Link
      to="/portfolio"
      className="mx-4 flex items-center gap-3 rounded-2xl border bg-card p-3 text-foreground no-underline shadow-xs transition-colors hover:border-input sm:mx-0"
    >
      <Avatar name={profile?.displayName ?? ''} urls={profile?.avatarUrls ?? null} />
      <span className="flex-1 text-muted-foreground">{t('home.sharePrompt')}</span>
      <span className={buttonLink('primary', 'sm')}>
        <ImagePlus aria-hidden="true" />
        {t('home.shareAction')}
      </span>
    </Link>
  );
}

/** Where an agent starts: a search box that opens the full search. */
function SearchStart() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  return (
    <form
      role="search"
      className="mx-4 flex items-center gap-2 rounded-full border bg-card p-1.5 pl-4 shadow-xs focus-within:border-ring sm:mx-0"
      onSubmit={(event: SubmitEvent) => {
        event.preventDefault();
        const q = query.trim();
        void navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
      }}
    >
      <label className="sr-only" htmlFor="home-search">
        {t('home.searchLabel')}
      </label>
      <Search aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      <input
        id="home-search"
        type="search"
        enterKeyHint="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        placeholder={t('home.searchPlaceholder')}
        className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        maxLength={100}
      />
      <Button type="submit" size="sm">
        {t('home.findTalent')}
      </Button>
    </form>
  );
}

/** What a talent must know before anything else: their photo is missing or being checked. */
function TalentNotices() {
  const data = useMyTalentProfile().data;
  if (data?.photoInReview) {
    return (
      <p className="flex items-start gap-3 rounded-2xl border bg-card p-4 text-sm">
        <Clock3 aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <span>
          <span className="block font-semibold">{t('home.photoInReview')}</span>
          {t('home.photoInReviewBody')}
        </span>
      </p>
    );
  }
  if (data && !data.avatarUrls) {
    return (
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
    );
  }
  return null;
}

/** An agency that is not verified yet cannot contact anyone, so that comes first. */
function AgentNotices() {
  const data = useMyAgentProfile().data;
  return data && !data.verified ? <VerificationCard /> : null;
}

const sideCard = 'grid gap-4 rounded-2xl border bg-card p-5 shadow-xs';

function Stat({ value, label }: { readonly value: number | undefined; readonly label: string }) {
  return (
    <span className="grid">
      <span className="text-lg font-bold">{value ?? '–'}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

function TalentCard() {
  const data = useMyTalentProfile().data;
  const social = useTalentSocial(data?.handle ?? '', Boolean(data?.isComplete)).data;
  if (!data) return null;
  const about = [
    data.subcategories[0]?.name ?? data.category?.name,
    data.city && placeLabel(data.city),
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <section className={sideCard} aria-label={t('home.yourProfile')}>
      <Link
        to={`/talents/${data.handle}`}
        className="flex items-center gap-3 text-foreground no-underline"
      >
        <Avatar name={data.displayName ?? ''} urls={data.avatarUrls} size="lg" ring />
        <span className="grid min-w-0">
          <span className="truncate text-lg font-bold">{data.displayName}</span>
          <span className="truncate text-sm text-muted-foreground">{about}</span>
        </span>
      </Link>
      <div className="grid grid-cols-3 text-center">
        <Stat value={social?.posts} label={t('social.posts')} />
        <Stat value={social?.followers} label={t('social.followers')} />
        <Stat value={social?.following} label={t('social.followingCount')} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link className={buttonLink('secondary', 'sm')} to={`/talents/${data.handle}`}>
          {t('home.publicProfile')}
        </Link>
        <Link className={buttonLink('secondary', 'sm')} to="/onboarding/talent/about">
          <PenLine aria-hidden="true" />
          {t('home.editProfile')}
        </Link>
      </div>
    </section>
  );
}

function AgentCard() {
  const data = useMyAgentProfile().data;
  if (!data) return null;
  return (
    <section className={sideCard} aria-label={t('home.yourProfile')}>
      <div className="flex items-center gap-3">
        <Avatar name={data.agencyName ?? ''} urls={null} size="lg" />
        <span className="grid min-w-0 gap-1">
          <span className="truncate text-lg font-bold">{data.agencyName}</span>
          <span
            className={cn(
              'inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold',
              data.verified
                ? 'bg-success-surface text-success'
                : 'bg-spotlight text-spotlight-foreground',
            )}
          >
            {data.verified ? (
              <BadgeCheck aria-hidden="true" className="size-3.5" />
            ) : (
              <Clock3 aria-hidden="true" className="size-3.5" />
            )}
            {data.verified ? t('home.verifiedChip') : t('home.pendingChip')}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Link className={buttonLink('secondary', 'sm')} to="/shortlist">
          {t('home.yourShortlist')}
        </Link>
        <Link className={buttonLink('secondary', 'sm')} to="/onboarding/agent">
          <PenLine aria-hidden="true" />
          {t('home.editProfile')}
        </Link>
      </div>
    </section>
  );
}

/** A way into search by what someone does. */
function Categories() {
  const categories = useTaxonomy().data?.categories ?? [];
  if (categories.length === 0) return null;
  return (
    <section className="stack gap-3" aria-labelledby="browse-heading">
      <SectionHeading id="browse-heading" title={t('home.browse')} />
      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {categories.map((category) => {
          const Icon = categoryIcon(category.slug);
          return (
            <li key={category.slug}>
              <Link
                to={`/search?category=${category.slug}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border bg-card px-3.5 text-sm font-semibold text-foreground no-underline transition-colors hover:border-input hover:bg-accent"
              >
                <Icon aria-hidden="true" className="size-4" />
                {category.name}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

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
      <h2 id={id} className="text-base font-semibold">
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
