import type { Post } from '@rt/contracts';
import { useQuery } from '@tanstack/react-query';
import {
  AudioLines,
  Cake,
  Heart,
  ImageOff,
  ImagePlus,
  MapPin,
  MessageCircle,
  PenLine,
  Play,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { api } from '../../shared/api/client';
import { placeLabel } from '../../shared/places';
import { Avatar } from '../../shared/ui/Avatar';
import { Button, buttonLink } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { PageSkeleton } from '../../shared/ui/PageSkeleton';
import { VerifiedBadge } from '../../shared/ui/VerifiedBadge';
import { useSession } from '../auth/use-auth';
import { ContactPanel, TalentMessagePanel } from '../messages/ContactPanel';
import { useMyTalentProfile } from '../profile/queries';
import { SaveToggle } from '../shortlist/SaveToggle';
import { FollowButton } from '../social/FollowButton';
import { RemoveMedia } from '../moderation/RemoveMedia';
import { PostCard } from '../social/PostCard';
import { useTalentPosts, useTalentSocial } from '../social/queries';
import { ReportProfile } from './ReportProfile';
import { ShareCard } from './ShareCard';

/**
 * A talent's page: who they are, their numbers, and their work in a grid. Ready media only,
 * age in years, never the date of birth. On your own page the actions are yours: edit, post
 * and share.
 */
export function TalentProfilePage() {
  const { handle = '' } = useParams();
  const me = useSession().me;
  const profile = useQuery({
    queryKey: ['talents', handle],
    queryFn: () => api.call('talents.getByHandle', { params: { handle } }),
    retry: (failures, error) => !isApiError(error, 'NOT_FOUND') && failures < 2,
  });
  const social = useTalentSocial(handle, profile.isSuccess);
  const posts = useTalentPosts(handle, profile.isSuccess);
  const isSelf = social.data?.isSelf ?? false;
  const mine = useMyTalentProfile(isSelf);
  const [open, setOpen] = useState<string | null>(null);

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
  const isAgent = me?.role === 'agent' && me.status === 'active';
  const isTalent = me?.role === 'talent' && me.status === 'active';
  const discipline =
    talent.subcategories.map((entry) => entry.name).join(', ') || talent.category.name;
  const items = posts.data?.pages.flatMap((page) => page.items) ?? [];
  const opened = items.find((post) => post.id === open) ?? null;
  const stats = [
    { value: social.data?.posts, label: t('social.posts') },
    { value: social.data?.followers, label: t('social.followers') },
    { value: social.data?.following, label: t('social.followingCount') },
  ];

  return (
    <Page
      title={talent.displayName}
      documentTitle={t('titles.talentProfile', { name: talent.displayName })}
      width="wide"
      className="[&>div]:max-w-4xl [&>div>header]:sr-only"
      hero={
        <section className="grid gap-5" aria-label={talent.displayName}>
          {/*
           * Who they are, on the stage (UI design, profile): the face in the spotlight, the
           * name in display type, what they do in marigold capitals, their numbers below.
           */}
          <div className="-mx-4 -mt-6 grid justify-items-center gap-3 bg-stage stage-glow px-5 pt-8 pb-6 text-center text-stage-ink sm:mx-0 sm:mt-0 sm:rounded-3xl sm:px-10 sm:pt-10">
            <Avatar name={talent.displayName} urls={talent.avatarUrls} size="xl" ring />
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <p
                className="m-0 font-display text-4xl leading-none font-bold tracking-[-0.01em] sm:text-5xl"
                aria-hidden="true"
              >
                {talent.displayName}
              </p>
              {talent.verified ? <VerifiedBadge /> : null}
            </div>
            <p className="m-0 label-caps text-spotlight">{discipline}</p>
            <ul className="m-0 flex list-none flex-wrap justify-center gap-x-4 gap-y-1 p-0 text-sm text-stage-ink-muted">
              <li className="inline-flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="size-4" strokeWidth={1.75} />
                {placeLabel(talent.city, 'long')}
              </li>
              {talent.ageYears === null ? null : (
                <li className="inline-flex items-center gap-1.5">
                  <Cake aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  {t('talent.age', { age: talent.ageYears })}
                </li>
              )}
            </ul>
            <p className="m-0 max-w-xl leading-relaxed whitespace-pre-line">{talent.bio}</p>
            <dl className="m-0 mt-2 grid w-full max-w-md grid-cols-3 border-t border-stage-ink/15 pt-5">
              {stats.map((stat) => (
                <div key={stat.label} className="grid gap-1">
                  <dt className="text-sm text-stage-ink-muted">{stat.label}</dt>
                  <dd className="m-0 font-display text-3xl leading-none font-bold">
                    {stat.value ?? '–'}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* One marigold action for whoever is looking; everything else in outline. */}
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:justify-center">
            {isSelf ? (
              <>
                <Link className={buttonLink('primary')} to="/portfolio">
                  <ImagePlus aria-hidden="true" />
                  {t('talent.addWork')}
                </Link>
                <Link className={buttonLink('secondary')} to="/onboarding/talent/about">
                  <PenLine aria-hidden="true" />
                  {t('home.editProfile')}
                </Link>
              </>
            ) : isAgent ? (
              <>
                <a href="#contact" className={buttonLink('primary')}>
                  <MessageCircle aria-hidden="true" />
                  {t('talent.contact')}
                </a>
                <SaveToggle handle={talent.handle} name={talent.displayName} size="default" />
                {social.data ? (
                  <FollowButton
                    handle={talent.handle}
                    name={talent.displayName}
                    following={social.data.followedByViewer}
                    size="default"
                    className="w-full sm:w-auto"
                  />
                ) : null}
              </>
            ) : social.data ? (
              <>
                <FollowButton
                  handle={talent.handle}
                  name={talent.displayName}
                  following={social.data.followedByViewer}
                  size="default"
                  prominent
                  className="w-full sm:w-auto"
                />
                {isTalent ? (
                  <a href="#contact" className={buttonLink('secondary')}>
                    <MessageCircle aria-hidden="true" />
                    {t('talent.message')}
                  </a>
                ) : null}
              </>
            ) : null}
          </div>

          {talent.skills.length > 0 ? (
            <ul
              className="m-0 flex list-none flex-wrap justify-center gap-2 p-0"
              aria-label={t('talent.skills')}
            >
              {talent.skills.map((skill) => (
                <li
                  key={skill.slug}
                  className="rounded-full border-[1.5px] border-input bg-card px-4 py-2 text-sm font-medium"
                >
                  {skill.name}
                </li>
              ))}
            </ul>
          ) : null}
          {talent.avatarMediaId ? (
            <RemoveMedia mediaId={talent.avatarMediaId} what="photo" owner={talent.displayName} />
          ) : null}
        </section>
      }
    >
      {isSelf && mine.data ? <ShareCard profile={mine.data} /> : null}

      <section className="stack border-t pt-6" aria-labelledby="portfolio-heading">
        <h2 id="portfolio-heading" className="sr-only">
          {t('talent.portfolio')}
        </h2>
        <FormMessage tone="error">{posts.error ? errorMessage(posts.error) : null}</FormMessage>
        {posts.isSuccess && items.length === 0 ? (
          <EmptyState
            icon={ImageOff}
            title={isSelf ? t('talent.noPortfolioMine') : t('talent.noPortfolio')}
          >
            {isSelf ? (
              <Link className={buttonLink('primary', 'sm')} to="/portfolio">
                <ImagePlus aria-hidden="true" />
                {t('talent.addWork')}
              </Link>
            ) : null}
          </EmptyState>
        ) : null}
        <ul className="m-0 grid list-none grid-cols-3 gap-1.5 p-0 sm:gap-3">
          {items.map((post, index) => (
            <li key={post.id}>
              <Tile
                post={post}
                position={index + 1}
                eager={index < 6}
                onOpen={() => {
                  setOpen(post.id);
                }}
              />
            </li>
          ))}
        </ul>
        {posts.hasNextPage ? (
          <Button
            variant="secondary"
            loading={posts.isFetchingNextPage}
            onClick={() => void posts.fetchNextPage()}
          >
            {t('home.morePosts')}
          </Button>
        ) : null}
      </section>

      {isSelf ? null : (
        <aside className="grid gap-4 border-t pt-6" id="contact" aria-label={t('talent.contact')}>
          {isAgent ? <ContactPanel handle={talent.handle} name={talent.displayName} /> : null}
          {isTalent ? (
            <TalentMessagePanel handle={talent.handle} name={talent.displayName} />
          ) : null}
          <ReportProfile handle={talent.handle} />
        </aside>
      )}

      <PostDialog
        post={opened}
        onClose={() => {
          setOpen(null);
        }}
      />
    </Page>
  );
}

/** One square of the grid. The like count shows on hover and to screen readers. */
function Tile({
  post,
  position,
  eager,
  onOpen,
}: {
  readonly post: Post;
  readonly position: number;
  readonly eager: boolean;
  readonly onOpen: () => void;
}) {
  const values = { position, name: post.talent.displayName };
  const name =
    post.kind === 'video'
      ? t('talent.videoAlt', values)
      : post.kind === 'audio'
        ? t('talent.audioAlt', values)
        : post.kind === 'text'
          ? t('talent.textAlt', values)
          : t('talent.photoAlt', values);
  return (
    <button
      type="button"
      className="group relative block aspect-square w-full cursor-pointer overflow-hidden rounded-xl bg-muted sm:rounded-2xl"
      aria-label={post.caption ? `${name}: ${post.caption}` : name}
      onClick={onOpen}
    >
      {post.kind === 'text' ? (
        // The opening words stand in for a picture.
        <span className="flex size-full items-center bg-secondary p-2.5 text-left text-secondary-foreground sm:p-4">
          <span className="line-clamp-5 text-xs leading-snug font-medium break-words sm:text-sm">
            {post.caption}
          </span>
        </span>
      ) : post.kind === 'image' ? (
        <img
          className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          src={post.urls.medium}
          srcSet={`${post.urls.small} 256w, ${post.urls.medium} 1024w`}
          sizes="(max-width: 40rem) 33vw, 18rem"
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
        />
      ) : (
        <span className="grid size-full place-items-center bg-stage stage-glow text-stage-foreground">
          {post.kind === 'audio' ? (
            <AudioLines aria-hidden="true" className="size-8" />
          ) : (
            <Play aria-hidden="true" className="size-8 fill-current" />
          )}
        </span>
      )}
      <span className="absolute inset-0 hidden items-center justify-center gap-1.5 bg-stage/45 font-semibold text-stage-ink group-hover:flex group-focus-visible:flex">
        <Heart aria-hidden="true" className="size-5 fill-current" />
        {post.likes}
      </span>
    </button>
  );
}

/**
 * The opened post, in the browser's own dialog: it traps focus, closes on Escape and needs no
 * injected styles, which the content security policy would refuse.
 */
function PostDialog({
  post,
  onClose,
}: {
  readonly post: Post | null;
  readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (post && !element.open) element.showModal();
    if (!post && element.open) element.close();
  }, [post]);
  return (
    <dialog
      ref={dialog}
      aria-label={post ? t('social.postBy', { name: post.talent.displayName }) : undefined}
      className="m-auto w-[min(calc(100vw-1rem),32rem)] max-w-none overflow-visible bg-transparent p-0 backdrop:bg-stage/70"
      onClose={onClose}
      // A press on the dimmed area around the post closes it.
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      {post ? (
        <div className="grid gap-2">
          <button
            type="button"
            aria-label={t('common.close')}
            className="grid size-11 cursor-pointer place-items-center justify-self-end rounded-full bg-stage-ink/15 text-stage-ink hover:bg-stage-ink/30"
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-5" />
          </button>
          <div className="max-h-[82dvh] overflow-y-auto overscroll-contain rounded-3xl">
            <PostCard post={post} eager />
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
