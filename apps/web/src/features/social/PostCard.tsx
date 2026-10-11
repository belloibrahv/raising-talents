import type { Post } from '@rt/contracts';
import { BadgeCheck, Heart, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { VideoPlayer } from '../../shared/media/VideoPlayer';
import { placeLabel } from '../../shared/places';
import { timeAgo } from '../../shared/relative-time';
import { Avatar } from '../../shared/ui/Avatar';
import { useSession } from '../auth/use-auth';
import { RemoveMedia } from '../moderation/RemoveMedia';
import { useMyTalentProfile } from '../profile/queries';
import { ReportPost } from '../talents/ReportProfile';
import { Comments } from './Comments';
import { useLike } from './queries';

const likesLabel = (likes: number) =>
  likes === 1 ? t('social.likesOne') : t('social.likes', { count: likes });
const commentsLabel = (count: number) =>
  count === 1 ? t('comments.countOne') : t('comments.count', { count });

/** The heart under a post. Filled and red once liked, as people expect from every feed. */
export function LikeButton({ post }: { readonly post: Post }) {
  const like = useLike();
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-pressed={post.liked}
        aria-label={t('social.like', { name: post.talent.displayName })}
        className="-ml-2 grid size-11 cursor-pointer place-items-center rounded-full transition-colors hover:bg-accent active:scale-90"
        onClick={() => {
          like.mutate({ id: post.id, like: !post.liked });
        }}
      >
        <Heart
          aria-hidden="true"
          className={cn(
            'size-6 transition-transform',
            post.liked && 'scale-110 fill-like text-like',
          )}
        />
      </button>
      <span className="text-sm font-semibold" aria-live="polite">
        {likesLabel(post.likes)}
      </span>
    </div>
  );
}

interface PostCardProps {
  readonly post: Post;
  /** The first posts on screen load at once; the rest wait until they are scrolled to. */
  readonly eager?: boolean;
  /** Comments are folded away in a feed and open on the post's own page. */
  readonly commentsOpen?: boolean;
}

/**
 * One piece of work in a feed: who posted it, the photo or clip, the like, the caption and the
 * comments. Pressing the photo twice likes it, the gesture people already know.
 */
export function PostCard({ post, eager = false, commentsOpen = false }: PostCardProps) {
  const like = useLike();
  const [burst, setBurst] = useState(false);
  const [showComments, setShowComments] = useState(commentsOpen);
  // Members report what breaks the rules; moderators remove it; nobody reports their own.
  const me = useSession().me;
  const own = useMyTalentProfile(me?.role === 'talent');
  // A talent is offered it only once we know the post is not theirs.
  const canReport =
    me?.role === 'agent' ||
    (me?.role === 'talent' && own.isSuccess && own.data?.handle !== post.talent.handle);
  const { talent } = post;
  const discipline = talent.subcategories[0]?.name ?? talent.category.name;
  const profile = `/talents/${talent.handle}`;

  const likeFromPhoto = () => {
    if (!post.liked) like.mutate({ id: post.id, like: true });
    setBurst(true);
    window.setTimeout(() => {
      setBurst(false);
    }, 700);
  };

  return (
    <article
      className="overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-xs"
      aria-label={t('social.postBy', { name: talent.displayName })}
    >
      <div className="relative">
        {/* Who posted it sits on the photo, over a shade that keeps the words readable. */}
        <header
          className={cn(
            'flex items-center gap-3 px-4 py-3',
            post.kind === 'image' &&
              'absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/70 via-black/35 to-transparent pb-10 text-white',
          )}
        >
          <Link to={profile} className="rounded-full" tabIndex={-1} aria-hidden="true">
            <Avatar name={talent.displayName} urls={talent.avatarUrls} ring />
          </Link>
          <div className="grid min-w-0 flex-1">
            <Link
              to={profile}
              className={cn(
                'flex items-center gap-1 font-semibold no-underline hover:underline',
                post.kind === 'image' ? 'text-white' : 'text-foreground',
              )}
            >
              <span className="truncate">{talent.displayName}</span>
              {talent.verified ? (
                <>
                  <BadgeCheck
                    aria-hidden="true"
                    className={cn(
                      'size-4 shrink-0',
                      post.kind === 'image' ? 'text-white' : 'text-success',
                    )}
                  />
                  <span className="sr-only">{`, ${t('talent.verified')}`}</span>
                </>
              ) : null}
            </Link>
            <span
              className={cn(
                'truncate text-sm',
                post.kind === 'image' ? 'text-white/85' : 'text-muted-foreground',
              )}
            >
              {`${discipline} · ${placeLabel(talent.city)}`}
            </span>
          </div>
          <time
            className={cn(
              'shrink-0 text-sm',
              post.kind === 'image' ? 'text-white/85' : 'text-muted-foreground',
            )}
            dateTime={post.postedAt}
          >
            {timeAgo(post.postedAt)}
          </time>
        </header>

        {post.kind === 'video' ? (
          <div className="bg-black">
            <VideoPlayer
              playback={post.video}
              label={t('social.videoBy', { name: talent.displayName })}
            />
          </div>
        ) : (
          <div className="relative bg-muted" onDoubleClick={likeFromPhoto}>
            <img
              className="aspect-[4/5] w-full object-cover"
              src={post.urls.medium}
              srcSet={`${post.urls.small} 256w, ${post.urls.medium} 1024w, ${post.urls.large} 2048w`}
              sizes="(max-width: 40rem) 100vw, 36rem"
              alt={post.caption || t('social.photoBy', { name: talent.displayName })}
              loading={eager ? 'eager' : 'lazy'}
              decoding="async"
            />
            {burst ? (
              <Heart
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-1/2 size-24 -translate-1/2 animate-ping fill-white text-white drop-shadow-lg [animation-iteration-count:1]"
              />
            ) : null}
          </div>
        )}
      </div>

      <div className="grid gap-1 px-4 pt-1 pb-4">
        <div className="flex items-center gap-3">
          <LikeButton post={post} />
          <button
            type="button"
            aria-expanded={showComments}
            aria-label={t('comments.toggle', { name: talent.displayName })}
            className="flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-sm font-semibold transition-colors hover:bg-accent"
            onClick={() => {
              setShowComments((shown) => !shown);
            }}
          >
            <MessageCircle aria-hidden="true" className="size-6" />
            {commentsLabel(post.comments)}
          </button>
        </div>
        {post.caption ? (
          <p className="m-0 leading-relaxed">
            <Link to={profile} className="mr-1.5 font-semibold text-foreground no-underline">
              {talent.displayName}
            </Link>
            {post.caption}
          </p>
        ) : null}
        <RemoveMedia mediaId={post.mediaId} what="post" owner={talent.displayName} />
        {canReport ? (
          // The form's button sizes itself; the row keeps it at the start of the line.
          <div className="flex flex-col items-start">
            <ReportPost postId={post.id} />
          </div>
        ) : null}
        {showComments ? <Comments postId={post.id} owner={talent.displayName} /> : null}
      </div>
    </article>
  );
}
