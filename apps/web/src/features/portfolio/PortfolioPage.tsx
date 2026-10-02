import { PORTFOLIO_CAPTION_MAX, type MyPortfolioItem } from '@rt/contracts';
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
import { FullScreenStatus } from '../../shared/ui/FullScreenStatus';
import { Page } from '../../shared/ui/Page';
import { TextField } from '../../shared/ui/TextField';
import {
  useAddItem,
  useMoveItem,
  useMyPortfolio,
  useRemoveItem,
  useUpdateCaption,
} from './queries';

export function PortfolioPage() {
  const portfolio = useMyPortfolio();
  const add = useAddItem();
  const move = useMoveItem();
  const [upload, setUpload] = useState<{ fraction: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // One polite live region for every change, so screen readers hear what happened.
  const [announcement, setAnnouncement] = useState('');

  if (portfolio.isPending) return <FullScreenStatus />;
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
      <p className="field__hint">{t('portfolio.count', { count: items.length, max: maxItems })}</p>
      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
      <FormMessage tone="error">
        {problem ?? (move.error ? errorMessage(move.error) : null)}
      </FormMessage>
      {upload ? (
        <div className="stack" style={{ gap: 'var(--space-xs)' }}>
          <p role="status">
            {t('media.uploading', { percent: Math.round(upload.fraction * 100) })}
          </p>
          <div className="progress" aria-hidden="true">
            <div className="progress__bar" style={{ width: `${String(upload.fraction * 100)}%` }} />
          </div>
        </div>
      ) : full ? (
        <p className="message message--success">{t('portfolio.full')}</p>
      ) : (
        <FilePicker
          label={t('portfolio.add')}
          accept={ACCEPT_MEDIA}
          onPick={(file) => void pick(file)}
        />
      )}
      {items.length === 0 ? (
        <p className="page__subtitle">{t('portfolio.empty')}</p>
      ) : (
        <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
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
    <article className="card" aria-labelledby={headingId}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id={headingId} className="field__label">
          {t('portfolio.item', { position })}
        </h2>
        <span className={`badge badge--${item.mediaStatus}`}>{t(`media.${item.mediaStatus}`)}</span>
      </div>
      <ItemMedia item={item} name={name} />
      {item.mediaStatus === 'rejected' && item.rejectionReason ? (
        <p className="message message--error">
          {t('portfolio.rejectedReason', { reason: item.rejectionReason })}
        </p>
      ) : item.mediaStatus === 'held_for_review' ? (
        <p className="field__hint">{t('portfolio.heldBody')}</p>
      ) : item.mediaStatus !== 'ready' ? (
        <p className="field__hint">{t('portfolio.processingBody')}</p>
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
            className="button--small"
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
          className="button--small"
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
          className="button--small"
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
            className="button--small"
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
              className="button--small"
              loading={remove.isPending}
              onClick={() => {
                remove.mutate(item.id, { onSuccess: onRemoved });
              }}
            >
              {t('portfolio.removeYes')}
            </Button>
            <Button
              variant="text"
              className="button--small"
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
        className="media-frame"
        src={item.urls.medium}
        srcSet={`${item.urls.small} 256w, ${item.urls.medium} 1024w, ${item.urls.large} 2048w`}
        sizes="(max-width: 30rem) 100vw, 30rem"
        alt={name}
        loading="lazy"
        decoding="async"
      />
    );
  }
  return <div className="media-frame" aria-hidden="true" />;
}
