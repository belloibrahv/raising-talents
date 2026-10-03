import { PORTFOLIO_CAPTION_MAX, type MediaStatus, type MyPortfolioItem } from '@rt/contracts';
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
import { VideoPlayer } from '../../shared/media/VideoPlayer';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { PageSkeleton } from '../../shared/ui/PageSkeleton';
import { Page } from '../../shared/ui/Page';
import { TextField } from '../../shared/ui/TextField';
import {
  useAddItem,
  useMoveItem,
  useMyPortfolio,
  useRemoveItem,
  useUpdateCaption,
} from './queries';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ImagePlus } from 'lucide-react';
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
        <FilePicker
          label={t('portfolio.add')}
          accept={ACCEPT_MEDIA}
          onPick={(file) => void pick(file)}
        />
      )}
      {items.length === 0 ? (
        <EmptyState icon={ImagePlus} title={t('portfolio.empty')} />
      ) : (
        <ol className="stack m-0 list-none p-0">
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
  const [confirming, setConfirming] = useState(false);
  const name = item.caption || t('portfolio.item', { position });
  const headingId = `item-${item.id}`;

  return (
    <article
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
      aria-labelledby={headingId}
    >
      <div className="row justify-between">
        <h2 id={headingId} className="text-base font-semibold">
          {t('portfolio.item', { position })}
        </h2>
        <Badge variant={STATUS_BADGE[item.mediaStatus]}>{t(`media.${item.mediaStatus}`)}</Badge>
      </div>
      <ItemMedia item={item} name={name} />
      {item.mediaStatus === 'rejected' && item.rejectionReason ? (
        <FormMessage announce={false} tone="error">
          {t('portfolio.rejectedReason', { reason: item.rejectionReason })}
        </FormMessage>
      ) : item.mediaStatus === 'held_for_review' ? (
        <p className="text-sm text-muted-foreground">{t('portfolio.heldBody')}</p>
      ) : item.mediaStatus !== 'ready' ? (
        <p className="text-sm text-muted-foreground">{t('portfolio.processingBody')}</p>
      ) : null}
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          updateCaption.mutate({ itemId: item.id, caption: caption.trim() });
        }}
      >
        <TextField
          label={t('portfolio.caption')}
          hint={t('portfolio.captionHint', { max: PORTFOLIO_CAPTION_MAX })}
          value={caption}
          maxLength={PORTFOLIO_CAPTION_MAX}
          onChange={(event) => {
            setCaption(event.target.value);
          }}
        />
        <div className="row">
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            loading={updateCaption.isPending}
            disabled={caption.trim() === item.caption}
          >
            {t('portfolio.saveCaption')}
          </Button>
          <FormMessage tone="success">
            {updateCaption.isSuccess ? t('portfolio.captionSaved') : null}
          </FormMessage>
        </div>
      </form>
      <div className="row">
        <Button
          variant="secondary"
          size="sm"
          disabled={isFirst || moving}
          aria-label={t('portfolio.moveUp', { name })}
          onClick={() => {
            onMove(-1);
          }}
        >
          ↑
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={isLast || moving}
          aria-label={t('portfolio.moveDown', { name })}
          onClick={() => {
            onMove(1);
          }}
        >
          ↓
        </Button>
        {confirming ? null : (
          <Button
            variant="text"
            size="sm"
            onClick={() => {
              setConfirming(true);
            }}
          >
            {t('portfolio.remove')}
          </Button>
        )}
      </div>
      {confirming ? (
        <div className="stack" role="group" aria-label={t('portfolio.removeConfirm')}>
          <p>{t('portfolio.removeConfirm')}</p>
          <div className="row">
            <Button
              size="sm"
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
      ) : null}
    </article>
  );
}

function ItemMedia({ item, name }: { item: MyPortfolioItem; name: string }) {
  if (item.kind === 'video' && item.video) {
    return (
      <VideoPlayer
        playback={item.video}
        label={`${name}. ${t('portfolio.videoLabel', { seconds: Math.round(item.video.durationSeconds) })}`}
      />
    );
  }
  if (item.urls) {
    return (
      <img
        className="aspect-[4/5] w-full rounded-xl bg-muted object-cover"
        src={item.urls.medium}
        srcSet={`${item.urls.small} 256w, ${item.urls.medium} 1024w, ${item.urls.large} 2048w`}
        sizes="(max-width: 30rem) 100vw, 30rem"
        alt={name}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <div className="aspect-[4/5] w-full rounded-xl bg-muted object-cover" aria-hidden="true" />
  );
}
