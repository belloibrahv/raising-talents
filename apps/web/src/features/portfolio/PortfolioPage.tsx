import {
  PORTFOLIO_CAPTION_MAX,
  POST_TEXT_MAX,
  type MediaStatus,
  type MyPortfolioItem,
} from '@rt/contracts';
import { useState } from 'react';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { FilePicker } from '../../shared/media/FilePicker';
import {
  ACCEPT_MEDIA,
  FileProblem,
  prepareForUpload,
  uploadMedia,
} from '../../shared/media/upload';
import { AudioPlayer } from '../../shared/media/AudioPlayer';
import { VideoPlayer } from '../../shared/media/VideoPlayer';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { PageSkeleton } from '../../shared/ui/PageSkeleton';
import { Page } from '../../shared/ui/Page';
import { TextArea } from '../../shared/ui/TextArea';
import { TextField } from '../../shared/ui/TextField';
import {
  useAddItem,
  useAddText,
  useMoveItem,
  useMyPortfolio,
  useRemoveItem,
  useUpdateCaption,
} from './queries';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, AudioLines, ImagePlus, PenLine, Trash2 } from 'lucide-react';
import { EmptyState } from '../../shared/ui/EmptyState';

/** Ready is good news, held and in progress are neutral, rejected and failed need the owner. */
const STATUS_BADGE: Record<MediaStatus, 'success' | 'secondary' | 'destructive'> = {
  awaiting_upload: 'secondary',
  processing: 'secondary',
  scanning: 'secondary',
  ready: 'success',
  held_for_review: 'secondary',
  rejected: 'destructive',
  failed: 'destructive',
  deleted: 'secondary',
};

export function PortfolioPage() {
  const portfolio = useMyPortfolio();
  const add = useAddItem();
  const move = useMoveItem();
  const [upload, setUpload] = useState<{ fraction: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // One polite live region for every change, so screen readers hear what happened.
  const [announcement, setAnnouncement] = useState('');

  if (portfolio.isPending) return <PageSkeleton />;
  if (portfolio.isError) {
    return (
      <Page title={t('portfolio.title')}>
        <FormMessage tone="error">{errorMessage(portfolio.error)}</FormMessage>
      </Page>
    );
  }
  const { items, maxItems } = portfolio.data;
  const full = items.length >= maxItems;

  const pick = async (file: File) => {
    setProblem(null);
    try {
      const prepared = await prepareForUpload(file, { videoAllowed: true });
      setUpload({ fraction: 0 });
      const asset = await uploadMedia({
        purpose: 'portfolio',
        file: prepared,
        onProgress: (fraction) => {
          setUpload({ fraction });
        },
      });
      await add.mutateAsync(asset.id);
    } catch (error) {
      setProblem(error instanceof FileProblem ? error.message : errorMessage(error));
    } finally {
      setUpload(null);
    }
  };

  return (
    <Page
      title={t('portfolio.title')}
      documentTitle={t('titles.portfolio')}
      subtitle={t('portfolio.body', { max: maxItems })}
      width="wide"
      className="[&>div]:max-w-4xl"
    >
      <p className="text-sm text-muted-foreground">
        {t('portfolio.count', { count: items.length, max: maxItems })}
      </p>
      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
      <FormMessage tone="error">
        {problem ?? (move.error ? errorMessage(move.error) : null)}
      </FormMessage>
      {upload ? (
        <div className="flex flex-col gap-1.5">
          <p role="status">
            {t('media.uploading', { percent: Math.round(upload.fraction * 100) })}
          </p>
          <Progress aria-hidden="true" value={upload.fraction * 100} />
        </div>
      ) : full ? (
        <FormMessage announce={false} tone="success">
          {t('portfolio.full')}
        </FormMessage>
      ) : (
        <div className="grid gap-4 rounded-2xl border bg-card p-4 shadow-xs sm:p-5">
          <TextComposer
            onPosted={() => {
              setAnnouncement(t('portfolio.textPosted'));
            }}
          />
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <span className="text-sm text-muted-foreground">{t('portfolio.orAdd')}</span>
            <FilePicker
              label={t('portfolio.add')}
              accept={ACCEPT_MEDIA}
              onPick={(file) => void pick(file)}
            />
          </div>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState icon={ImagePlus} title={t('portfolio.empty')} />
      ) : (
        <ol className="m-0 grid list-none grid-cols-2 gap-3 p-0 max-[339px]:grid-cols-1 sm:gap-4 lg:grid-cols-3">
          {items.map((item, index) => (
            <li key={item.id}>
              <PortfolioItemCard
                item={item}
                position={index + 1}
                isFirst={index === 0}
                isLast={index === items.length - 1}
                moving={move.isPending}
                onMove={(by) => {
                  move.mutate(
                    { itemId: item.id, by },
                    {
                      onSuccess: () => {
                        setAnnouncement(t('portfolio.moved', { position: index + 1 + by }));
                      },
                    },
                  );
                }}
                onRemoved={() => {
                  setAnnouncement(t('portfolio.removed'));
                }}
              />
            </li>
          ))}
        </ol>
      )}
    </Page>
  );
}

/** Words on their own: no file is needed to post (ADR-057). */
function TextComposer({ onPosted }: { readonly onPosted: () => void }) {
  const add = useAddText();
  const [text, setText] = useState('');
  const words = text.trim();
  return (
    <form
      className="grid gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!words || add.isPending) return;
        add.mutate(words, {
          onSuccess: () => {
            setText('');
            onPosted();
          },
        });
      }}
    >
      <TextArea
        label={t('portfolio.textLabel')}
        hint={t('portfolio.textHint', { max: POST_TEXT_MAX })}
        placeholder={t('portfolio.textPlaceholder')}
        value={text}
        maxLength={POST_TEXT_MAX}
        rows={3}
        onChange={(event) => {
          setText(event.target.value);
        }}
      />
      <FormMessage tone="error">{add.error ? errorMessage(add.error) : null}</FormMessage>
      <Button
        type="submit"
        size="sm"
        className="justify-self-start"
        disabled={!words}
        loading={add.isPending}
      >
        {t('portfolio.textPost')}
      </Button>
    </form>
  );
}

interface CardProps {
  readonly item: MyPortfolioItem;
  readonly position: number;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly moving: boolean;
  readonly onMove: (by: -1 | 1) => void;
  readonly onRemoved: () => void;
}

function PortfolioItemCard({
  item,
  position,
  isFirst,
  isLast,
  moving,
  onMove,
  onRemoved,
}: CardProps) {
  const updateCaption = useUpdateCaption();
  const remove = useRemoveItem();
  const [caption, setCaption] = useState(item.caption);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const isText = item.kind === 'text';
  // A text post is named by its place, not by repeating all of its words.
  const name = isText
    ? t('portfolio.item', { position })
    : item.caption || t('portfolio.item', { position });
  const headingId = `item-${item.id}`;
  const iconButton =
    'grid h-10 min-w-0 flex-1 cursor-pointer place-items-center rounded-full text-foreground transition-colors hover:bg-accent disabled:cursor-default disabled:opacity-35 disabled:hover:bg-transparent';

  return (
    <article
      className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-2.5 text-card-foreground shadow-xs"
      aria-labelledby={headingId}
    >
      <div className="relative">
        <ItemMedia item={item} name={name} />
        <span className="absolute top-2 left-2 grid h-7 min-w-7 place-items-center rounded-full bg-stage/55 px-2 text-xs font-bold text-stage-ink backdrop-blur-sm">
          <span aria-hidden="true">{position}</span>
          <h2 id={headingId} className="sr-only">
            {t('portfolio.item', { position })}
          </h2>
        </span>
        <Badge
          variant={STATUS_BADGE[item.mediaStatus]}
          className="absolute top-2 right-2 shadow-sm"
        >
          {t(`media.${item.mediaStatus}`)}
        </Badge>
      </div>
      <div className="flex flex-1 flex-col gap-2 px-1">
        {item.mediaStatus === 'rejected' && item.rejectionReason ? (
          <FormMessage announce={false} tone="error">
            {t('portfolio.rejectedReason', { reason: item.rejectionReason })}
          </FormMessage>
        ) : item.mediaStatus === 'held_for_review' ? (
          <p className="text-xs text-muted-foreground">{t('portfolio.heldBody')}</p>
        ) : item.mediaStatus !== 'ready' ? (
          <p className="text-xs text-muted-foreground">{t('portfolio.processingBody')}</p>
        ) : null}
        {editing ? (
          <form
            className="stack gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              updateCaption.mutate(
                { itemId: item.id, caption: caption.trim() },
                {
                  onSuccess: () => {
                    setEditing(false);
                  },
                },
              );
            }}
          >
            {isText ? (
              <TextArea
                label={t('portfolio.textField')}
                value={caption}
                maxLength={POST_TEXT_MAX}
                rows={4}
                autoFocus
                onChange={(event) => {
                  setCaption(event.target.value);
                }}
              />
            ) : (
              <TextField
                label={t('portfolio.caption')}
                hint={t('portfolio.captionHint', { max: PORTFOLIO_CAPTION_MAX })}
                value={caption}
                maxLength={PORTFOLIO_CAPTION_MAX}
                autoFocus
                onChange={(event) => {
                  setCaption(event.target.value);
                }}
              />
            )}
            <div className="row gap-2">
              <Button
                type="submit"
                size="sm"
                loading={updateCaption.isPending}
                disabled={caption.trim() === item.caption || (isText && caption.trim() === '')}
              >
                {t('portfolio.saveCaption')}
              </Button>
              <Button
                variant="text"
                size="sm"
                onClick={() => {
                  setCaption(item.caption);
                  setEditing(false);
                }}
              >
                {t('portfolio.cancel')}
              </Button>
            </div>
          </form>
        ) : isText ? null : (
          // The words of a text post are already on its tile.
          <p
            className={
              item.caption
                ? 'line-clamp-2 text-sm font-medium'
                : 'text-sm text-muted-foreground italic'
            }
          >
            {item.caption || t('portfolio.noCaption')}
          </p>
        )}
        <FormMessage tone="success">
          {updateCaption.isSuccess && !editing ? t('portfolio.captionSaved') : null}
        </FormMessage>
      </div>
      {confirming ? (
        <div
          className="stack gap-2 rounded-xl bg-destructive-surface p-3"
          role="group"
          aria-label={t(isText ? 'portfolio.removeConfirmText' : 'portfolio.removeConfirm')}
        >
          <p className="text-sm font-medium">
            {t(isText ? 'portfolio.removeConfirmText' : 'portfolio.removeConfirm')}
          </p>
          <div className="row gap-2">
            <Button
              size="sm"
              variant="danger"
              loading={remove.isPending}
              onClick={() => {
                remove.mutate(item.id, { onSuccess: onRemoved });
              }}
            >
              {t('portfolio.removeYes')}
            </Button>
            <Button
              variant="text"
              size="sm"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {t('portfolio.removeNo')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center border-t px-1 pt-2">
          <button
            type="button"
            className={iconButton}
            disabled={isFirst || moving}
            aria-label={t('portfolio.moveUp', { name })}
            onClick={() => {
              onMove(-1);
            }}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            className={iconButton}
            disabled={isLast || moving}
            aria-label={t('portfolio.moveDown', { name })}
            onClick={() => {
              onMove(1);
            }}
          >
            <ArrowRight aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            className={iconButton}
            aria-label={t(isText ? 'portfolio.editText' : 'portfolio.editCaption', { name })}
            aria-expanded={editing}
            onClick={() => {
              setEditing(!editing);
            }}
          >
            <PenLine aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            className={`${iconButton} text-destructive`}
            aria-label={t('portfolio.remove')}
            onClick={() => {
              setConfirming(true);
            }}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
    </article>
  );
}

function ItemMedia({ item, name }: { item: MyPortfolioItem; name: string }) {
  if (item.kind === 'text') {
    return (
      <div className="flex aspect-[4/5] w-full items-center rounded-xl bg-secondary p-4 pt-10 text-secondary-foreground">
        <p className="m-0 line-clamp-[9] text-sm leading-relaxed font-medium break-words whitespace-pre-line">
          {item.caption}
        </p>
      </div>
    );
  }
  if (item.kind === 'video' && item.video) {
    return (
      <VideoPlayer
        playback={item.video}
        // A stored file does not say how long it is until it is played.
        label={`${name}. ${
          item.video.durationSeconds > 0
            ? t('portfolio.videoLabel', { seconds: Math.round(item.video.durationSeconds) })
            : t('portfolio.videoLabelPlain')
        }`}
      />
    );
  }
  if (item.kind === 'audio' && item.audio) {
    return <AudioPlayer playback={item.audio} label={`${name}. ${t('portfolio.audioLabel')}`} />;
  }
  if (item.urls) {
    return (
      <img
        className="aspect-[4/5] w-full rounded-xl bg-muted object-cover"
        src={item.urls.medium}
        srcSet={`${item.urls.small} 256w, ${item.urls.medium} 1024w, ${item.urls.large} 2048w`}
        sizes="(max-width: 40rem) 50vw, 20rem"
        alt={name}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <div
      className="grid aspect-[4/5] w-full place-items-center rounded-xl bg-muted text-muted-foreground"
      aria-hidden="true"
    >
      {item.kind === 'audio' ? (
        <AudioLines className="size-8 opacity-50" />
      ) : (
        <ImagePlus className="size-8 opacity-50" />
      )}
    </div>
  );
}
