import type { HeldMedia, HeldMediaPage, RejectionCategory } from '@rt/contracts';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { api } from '../../shared/api/client';
import { VideoPlayer } from '../../shared/media/VideoPlayer';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { Select } from '../../shared/ui/Select';

const QUEUE_KEY = ['moderation', 'media'] as const;
const REASONS: readonly RejectionCategory[] = ['sexual', 'violence', 'hate', 'other'];

export function ModerationPage() {
  const [announcement, setAnnouncement] = useState('');
  const queue = useInfiniteQuery({
    queryKey: QUEUE_KEY,
    queryFn: ({ pageParam }) =>
      api.call('moderation.heldMedia', { query: pageParam ? { cursor: pageParam } : {} }),
    initialPageParam: '',
    getNextPageParam: (last: HeldMediaPage) => last.nextCursor ?? undefined,
  });
  const items = queue.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Page
      title={t('moderation.title')}
      documentTitle={t('titles.moderation')}
      subtitle={t('moderation.body')}
    >
      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
      <FormMessage tone="error">{queue.error ? errorMessage(queue.error) : null}</FormMessage>
      {queue.data && items.length === 0 ? (
        <p className="page__subtitle">{t('moderation.empty')}</p>
      ) : null}
      <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((item) => (
          <li key={item.id}>
            <HeldItem item={item} onDecided={setAnnouncement} />
          </li>
        ))}
      </ul>
      {queue.hasNextPage ? (
        <Button
          variant="secondary"
          loading={queue.isFetchingNextPage}
          onClick={() => void queue.fetchNextPage()}
        >
          {t('moderation.loadMore')}
        </Button>
      ) : null}
    </Page>
  );
}

function HeldItem({
  item,
  onDecided,
}: {
  readonly item: HeldMedia;
  readonly onDecided: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState<RejectionCategory | ''>('');
  const decide = useMutation({
    mutationFn: (
      decision: { decision: 'approve' } | { decision: 'reject'; category: RejectionCategory },
    ) => api.call('moderation.decideMedia', { params: { mediaId: item.id }, body: decision }),
    onSuccess: async (_result, decision) => {
      onDecided(
        decision.decision === 'approve' ? t('moderation.approved') : t('moderation.rejected'),
      );
      await queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
    },
  });
  const headingId = `held-${item.id}`;
  const when = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(item.heldAt),
  );

  return (
    <article className="card" aria-labelledby={headingId}>
      <h2 id={headingId} className="field__label">
        {t('moderation.item', {
          kind: t(`moderation.${item.kind}`),
          purpose: t(`moderation.${item.purpose}`),
          when,
        })}
      </h2>
      {item.video ? (
        <VideoPlayer playback={item.video} label={t('moderation.video')} />
      ) : item.urls ? (
        <img className="media-frame" src={item.urls.medium} alt={t('moderation.previewAlt')} />
      ) : null}
      <section aria-label={t('moderation.labels')}>
        <p className="field__label">{t('moderation.labels')}</p>
        <ul className="row" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {item.labels.map((label) => (
            <li key={label.name} className="badge">
              {t('moderation.confidence', {
                name: label.name,
                confidence: Math.round(label.confidence),
              })}
            </li>
          ))}
        </ul>
      </section>
      <FormMessage tone="error">{decide.error ? errorMessage(decide.error) : null}</FormMessage>
      {rejecting ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason) decide.mutate({ decision: 'reject', category: reason });
          }}
        >
          <Select
            label={t('moderation.reason')}
            placeholder={t('moderation.chooseReason')}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value as RejectionCategory | '');
            }}
            options={REASONS.map((category) => ({
              value: category,
              label: t(`moderation.${category}`),
            }))}
            required
          />
          <div className="row">
            <Button
              type="submit"
              className="button--small"
              disabled={!reason}
              loading={decide.isPending}
            >
              {t('moderation.confirmReject')}
            </Button>
            <Button
              variant="text"
              className="button--small"
              onClick={() => {
                setRejecting(false);
              }}
            >
              {t('moderation.cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="row">
          <Button
            className="button--small"
            loading={decide.isPending}
            onClick={() => {
              decide.mutate({ decision: 'approve' });
            }}
          >
            {t('moderation.approve')}
          </Button>
          <Button
            variant="secondary"
            className="button--small"
            onClick={() => {
              setRejecting(true);
            }}
          >
            {t('moderation.reject')}
          </Button>
        </div>
      )}
    </article>
  );
}
