import { COMMENT_MAX, type Comment } from '@rt/contracts';
import { BadgeCheck, SendHorizontal, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { timeAgo } from '../../shared/relative-time';
import { Avatar } from '../../shared/ui/Avatar';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { useSession } from '../auth/use-auth';
import { ReportComment } from '../talents/ReportProfile';
import { useAddComment, useComments, useDeleteComment } from './queries';

interface CommentsProps {
  readonly postId: string;
  /** Whose post it is, for the field's name on a screen full of posts. */
  readonly owner: string;
}

/**
 * What people wrote under a post, newest first, with a field to add to it (ADR-052). Talent
 * and agents write; moderators only read and delete.
 */
export function Comments({ postId, owner }: CommentsProps) {
  const role = useSession().me?.role;
  const canWrite = role === 'talent' || role === 'agent';
  const comments = useComments(postId);
  const items = comments.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <section className="grid gap-3 border-t pt-3" aria-label={t('comments.title', { name: owner })}>
      {canWrite ? <CommentForm postId={postId} owner={owner} /> : null}
      <FormMessage tone="error">{comments.error ? errorMessage(comments.error) : null}</FormMessage>
      {comments.isPending ? (
        <p className="m-0 text-sm text-muted-foreground" role="status">
          {t('comments.loading')}
        </p>
      ) : null}
      {comments.isSuccess && items.length === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">
          {canWrite ? t('comments.emptyWrite') : t('comments.empty')}
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="m-0 grid list-none gap-4 p-0">
          {items.map((comment) => (
            <li key={comment.id}>
              <CommentRow comment={comment} postId={postId} canReport={canWrite} />
            </li>
          ))}
        </ul>
      ) : null}
      {comments.hasNextPage ? (
        <Button
          variant="quiet"
          size="sm"
          className="justify-self-start"
          loading={comments.isFetchingNextPage}
          onClick={() => void comments.fetchNextPage()}
        >
          {t('comments.more')}
        </Button>
      ) : null}
    </section>
  );
}

function CommentForm({ postId, owner }: CommentsProps) {
  const add = useAddComment(postId);
  const [body, setBody] = useState('');
  const fieldId = useId();
  const text = body.trim();
  return (
    <form
      className="grid gap-1.5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!text || add.isPending) return;
        add.mutate(text, {
          onSuccess: () => {
            setBody('');
          },
        });
      }}
    >
      <div className="flex items-center gap-2">
        <label htmlFor={fieldId} className="sr-only">
          {t('comments.field', { name: owner })}
        </label>
        <input
          id={fieldId}
          className="h-11 min-w-0 flex-1 rounded-full border bg-background px-4 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          placeholder={t('comments.placeholder')}
          value={body}
          maxLength={COMMENT_MAX}
          autoComplete="off"
          enterKeyHint="send"
          onChange={(event) => {
            setBody(event.target.value);
          }}
        />
        <Button
          type="submit"
          size="sm"
          className="size-11 shrink-0 rounded-full p-0"
          aria-label={t('comments.send')}
          disabled={!text}
          loading={add.isPending}
        >
          {add.isPending ? null : <SendHorizontal aria-hidden="true" />}
        </Button>
      </div>
      {body.length >= COMMENT_MAX - 50 ? (
        <p className="m-0 text-xs text-muted-foreground" aria-live="polite">
          {t('comments.left', { count: COMMENT_MAX - body.length })}
        </p>
      ) : null}
      <FormMessage tone="error">{add.error ? errorMessage(add.error) : null}</FormMessage>
    </form>
  );
}

function CommentRow({
  comment,
  postId,
  canReport,
}: {
  readonly comment: Comment;
  readonly postId: string;
  readonly canReport: boolean;
}) {
  const remove = useDeleteComment(postId);
  const [confirming, setConfirming] = useState(false);
  const { author } = comment;
  const page = author.handle
    ? `/talents/${author.handle}`
    : author.agentId
      ? `/agents/${author.agentId}`
      : null;
  const name = (
    <>
      <span className="break-words">{author.name}</span>
      {author.verified ? (
        <>
          <BadgeCheck aria-hidden="true" className="size-3.5 shrink-0 text-success" />
          <span className="sr-only">{`, ${t('talent.verified')}`}</span>
        </>
      ) : null}
    </>
  );
  return (
    <article className="flex gap-3" aria-label={t('comments.by', { name: author.name })}>
      <Avatar name={author.name} urls={author.avatarUrls} size="sm" />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="m-0 leading-relaxed break-words whitespace-pre-line">
          {page ? (
            <Link
              to={page}
              className="mr-1.5 inline-flex items-center gap-1 align-baseline font-semibold text-foreground no-underline hover:underline"
            >
              {name}
            </Link>
          ) : (
            <span className="mr-1.5 inline-flex items-center gap-1 align-baseline font-semibold">
              {name}
            </span>
          )}
          {comment.body}
        </p>
        {/* The report link sits in the row; once opened, its form takes a line of its own. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground [&>button]:h-8 [&>button]:px-2 [&>form]:mt-2 [&>form]:basis-full">
          <time dateTime={comment.postedAt}>{timeAgo(comment.postedAt)}</time>
          {comment.canDelete && !confirming ? (
            <Button
              variant="quiet"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                setConfirming(true);
              }}
            >
              <Trash2 aria-hidden="true" />
              {t('comments.delete')}
            </Button>
          ) : null}
          {confirming ? (
            <span
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label={t('comments.deleteConfirm')}
            >
              <span className="text-foreground">{t('comments.deleteConfirm')}</span>
              <Button
                variant="danger"
                size="sm"
                className="h-8"
                loading={remove.isPending}
                onClick={() => {
                  remove.mutate(comment.id);
                }}
              >
                {t('comments.delete')}
              </Button>
              <Button
                variant="text"
                size="sm"
                className="h-8"
                onClick={() => {
                  setConfirming(false);
                }}
              >
                {t('report.cancel')}
              </Button>
            </span>
          ) : null}
          {canReport && !comment.mine && !confirming ? (
            <ReportComment commentId={comment.id} />
          ) : null}
        </div>
        <FormMessage tone="error">{remove.error ? errorMessage(remove.error) : null}</FormMessage>
      </div>
    </article>
  );
}
