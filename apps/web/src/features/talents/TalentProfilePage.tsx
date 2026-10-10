import type { Post } from '@rt/contracts';
import { useQuery } from '@tanstack/react-query';
import {
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
import { Badge } from '@/components/ui/badge';
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
import { ContactPanel } from '../messages/ContactPanel';
import { useMyTalentProfile } from '../profile/queries';
import { SaveToggle } from '../shortlist/SaveToggle';
import { FollowButton } from '../social/FollowButton';
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
          <div className="flex items-center gap-5 sm:gap-10">
            <Avatar name={talent.displayName} urls={talent.avatarUrls} size="xl" ring />
            <div className="grid min-w-0 flex-1 gap-4">
              <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 sm:flex">
                <p className="m-0 font-display text-3xl leading-tight font-bold" aria-hidden="true">
                  {talent.displayName}
                </p>
                {talent.verified ? <VerifiedBadge /> : null}
              </div>
              <dl className="m-0 grid max-w-sm grid-cols-3 text-center sm:text-left">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="flex flex-col-reverse sm:flex-row-reverse sm:justify-end sm:gap-1.5"
                  >
                    <dt className="text-sm text-muted-foreground sm:text-base">{stat.label}</dt>
                    <dd className="m-0 text-lg font-bold sm:text-base">{stat.value ?? '–'}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:hidden">
              <p className="m-0 font-display text-2xl leading-tight font-bold" aria-hidden="true">
                {talent.displayName}
              </p>
              {talent.verified ? <VerifiedBadge /> : null}
            </div>
            <p className="m-0 font-semibold">{discipline}</p>
            <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm text-muted-foreground">
              <li className="inline-flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="size-4" />
                {placeLabel(talent.city, 'long')}
              </li>
              {talent.ageYears === null ? null : (
                <li className="inline-flex items-center gap-1.5">
                  <Cake aria-hidden="true" className="size-4" />
                  {t('talent.age', { age: talent.ageYears })}
                </li>
              )}
            </ul>
            <p className="m-0 max-w-2xl leading-relaxed whitespace-pre-line">{talent.bio}</p>
            {talent.skills.length > 0 ? (
              <ul className="row m-0 mt-1 list-none gap-2 p-0" aria-label={t('talent.skills')}>
                {talent.skills.map((skill) => (
                  <li key={skill.slug}>
                    <Badge variant="secondary" className="px-3 py-1 text-sm">
                      {skill.name}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="flex flex-wrap items-start gap-2">
            {isSelf ? (
              <>
                <Link className={buttonLink('secondary', 'sm')} to="/onboarding/talent/about">
                  <PenLine aria-hidden="true" />
                  {t('home.editProfile')}
                </Link>
                <Link className={buttonLink('primary', 'sm')} to="/portfolio">
                  <ImagePlus aria-hidden="true" />
                  {t('talent.addWork')}
                </Link>
              </>
            ) : social.data ? (
              <FollowButton
                handle={talent.handle}
                name={talent.displayName}
                following={social.data.followedByViewer}
              />
            ) : null}
            {isAgent ? (
              <>
                <a href="#contact" className={buttonLink('secondary', 'sm')}>
                  <MessageCircle aria-hidden="true" />
                  {t('talent.contact')}
                </a>
                <SaveToggle handle={talent.handle} name={talent.displayName} />
              </>
            ) : null}
          </div>
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
        <ul className="m-0 grid list-none grid-cols-3 gap-1 p-0 sm:gap-3">
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
  const name = post.kind === 'video' ? t('talent.videoAlt', values) : t('talent.photoAlt', values);
  return (
    <button
      type="button"
      className="group relative block aspect-square w-full cursor-pointer overflow-hidden bg-muted sm:rounded-xl"
      aria-label={post.caption ? `${name}: ${post.caption}` : name}
      onClick={onOpen}
    >
      {post.kind === 'image' ? (
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
          <Play aria-hidden="true" className="size-8 fill-current" />
        </span>
      )}
      <span className="absolute inset-0 hidden items-center justify-center gap-1.5 bg-black/45 font-semibold text-white group-hover:flex group-focus-visible:flex">
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
      className="m-auto w-[min(100vw,32rem)] max-w-none overflow-visible bg-transparent p-0 backdrop:bg-black/70"
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
            className="grid size-10 cursor-pointer place-items-center justify-self-end rounded-full bg-white/15 text-white hover:bg-white/30"
            onClick={onClose}
          >
            <X aria-hidden="true" className="size-5" />
          </button>
          <div className="max-h-[82dvh] overflow-y-auto rounded-2xl">
            <PostCard post={post} eager />
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
