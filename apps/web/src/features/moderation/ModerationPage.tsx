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
import { ModerationTabs } from './ModerationTabs';
import { Badge } from '@/components/ui/badge';
import { CircleCheckBig } from 'lucide-react';
import { EmptyState } from '../../shared/ui/EmptyState';

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
      hero={<ModerationTabs />}
    >
      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
      <FormMessage tone="error">{queue.error ? errorMessage(queue.error) : null}</FormMessage>
      {queue.data && items.length === 0 ? (
        <EmptyState icon={CircleCheckBig} title={t('moderation.empty')} />
      ) : null}
      <ul className="stack m-0 list-none p-0">
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
    <article
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="text-base font-semibold">
        {t('moderation.item', {
          kind: t(`moderation.${item.kind}`),
          purpose: t(`moderation.${item.purpose}`),
          when,
        })}
      </h2>
      {item.video ? (
        <VideoPlayer playback={item.video} label={t('moderation.video')} />
      ) : item.urls ? (
        <img
          className="aspect-[4/5] w-full rounded-xl bg-muted object-cover"
          src={item.urls.medium}
          alt={t('moderation.previewAlt')}
        />
      ) : null}
      <section aria-label={t('moderation.labels')}>
        <p className="text-base font-semibold">{t('moderation.labels')}</p>
        <ul className="row m-0 list-none gap-2 p-0">
          {item.labels.map((label) => (
            <li key={label.name}>
              <Badge variant="secondary" className="text-sm">
                {t('moderation.confidence', {
                  name: label.name,
                  confidence: Math.round(label.confidence),
                })}
              </Badge>
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
            <Button type="submit" size="sm" disabled={!reason} loading={decide.isPending}>
              {t('moderation.confirmReject')}
            </Button>
            <Button
              variant="text"
              size="sm"
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
            size="sm"
            loading={decide.isPending}
            onClick={() => {
              decide.mutate({ decision: 'approve' });
            }}
          >
            {t('moderation.approve')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
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
