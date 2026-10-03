import type {
  ReportCategory,
  ReportDecision,
  ReportQueuePage,
  ReportedAccount,
} from '@rt/contracts';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { api } from '../../shared/api/client';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { Select } from '../../shared/ui/Select';
import { REPORT_CATEGORIES } from '../talents/ReportProfile';
import { ModerationTabs } from './ModerationTabs';
import { Badge } from '@/components/ui/badge';
import { CircleCheckBig } from 'lucide-react';
import { EmptyState } from '../../shared/ui/EmptyState';

const QUEUE_KEY = ['moderation', 'reports'] as const;

export function ReportQueuePage() {
  const [announcement, setAnnouncement] = useState('');
  const queue = useInfiniteQuery({
    queryKey: QUEUE_KEY,
    queryFn: ({ pageParam }) =>
      api.call('moderation.reports', { query: pageParam ? { cursor: pageParam } : {} }),
    initialPageParam: '',
    getNextPageParam: (last: ReportQueuePage) => last.nextCursor ?? undefined,
  });
  const items = queue.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Page
      title={t('moderation.reportsTitle')}
      documentTitle={t('titles.moderationReports')}
      subtitle={t('moderation.reportsBody')}
      hero={<ModerationTabs />}
    >
      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
      <FormMessage tone="error">{queue.error ? errorMessage(queue.error) : null}</FormMessage>
      {queue.data && items.length === 0 ? (
        <EmptyState icon={CircleCheckBig} title={t('moderation.reportsEmpty')} />
      ) : null}
      <ul className="stack m-0 list-none p-0">
        {items.map((item) => (
          <li key={item.accountId}>
            <ReportedAccountCard item={item} onDecided={setAnnouncement} />
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

const dateFormat = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' });

function ReportedAccountCard({
  item,
  onDecided,
}: {
  readonly item: ReportedAccount;
  readonly onDecided: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [restricting, setRestricting] = useState<'suspend' | 'ban' | null>(null);
  // The commonest complaint is the likely reason; the moderator can change it.
  const [reason, setReason] = useState<ReportCategory | ''>(item.categories[0]?.category ?? '');
  const decide = useMutation({
    mutationFn: (decision: ReportDecision) =>
      api.call('moderation.decideReports', {
        params: { accountId: item.accountId },
        body: decision,
      }),
    onSuccess: async (_result, decision) => {
      onDecided(t(`moderation.reports_${decision.decision}`));
      await queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
    },
  });
  const headingId = `reported-${item.accountId}`;
  const name = item.talent?.displayName ?? t('moderation.unnamedAccount');
  return (
    <article
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="text-base font-semibold">
        {t('moderation.reportedHeading', { name, count: item.openReports })}
      </h2>
      <div className="row">
        {item.status === 'active' ? null : (
          <Badge variant="secondary">{t(`moderation.status_${item.status}`)}</Badge>
        )}
        {item.previousActions > 0 ? (
          <Badge variant="destructive">
            {t('moderation.previousActions', { count: item.previousActions })}
          </Badge>
        ) : null}
      </div>
      <dl className="m-0 grid gap-x-6 gap-y-3 sm:grid-cols-2 [&_dd]:m-0 [&_dd]:break-words">
        <div>
          <dt className="text-sm text-muted-foreground">{t('moderation.profile')}</dt>
          <dd>
            {item.talent ? (
              <Link to={`/talents/${item.talent.handle}`} target="_blank" rel="noreferrer">
                {`@${item.talent.handle}`}
              </Link>
            ) : (
              t('moderation.none')
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t('moderation.reportedFor')}</dt>
          <dd>
            {item.categories
              .map((entry) =>
                t('moderation.categoryCount', {
                  category: t(`report.${entry.category}`),
                  count: entry.count,
                }),
              )
              .join(', ')}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">{t('moderation.firstReported')}</dt>
          <dd>{dateFormat.format(new Date(item.firstReportedAt))}</dd>
        </div>
      </dl>
      {item.notes.length > 0 ? (
        <section className="stack" aria-label={t('moderation.reporterNotes')}>
          <h3 className="text-sm text-muted-foreground">{t('moderation.reporterNotes')}</h3>
          <ul className="m-0 grid list-disc gap-1.5 ps-5">
            {item.notes.map((entry) => (
              <li key={entry.reportedAt + entry.note}>{entry.note}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <FormMessage tone="error">{decide.error ? errorMessage(decide.error) : null}</FormMessage>
      {restricting ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason) decide.mutate({ decision: restricting, reason });
          }}
        >
          <p className="text-sm text-muted-foreground">
            {t(restricting === 'ban' ? 'moderation.banExplain' : 'moderation.suspendExplain')}
          </p>
          <Select
            label={t('moderation.reason')}
            placeholder={t('moderation.chooseReason')}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value as ReportCategory | '');
            }}
            options={REPORT_CATEGORIES.map((category) => ({
              value: category,
              label: t(`report.${category}`),
            }))}
            required
          />
          <div className="row">
            <Button
              type="submit"
              size="sm"
              variant={restricting === 'ban' ? 'danger' : 'primary'}
              disabled={!reason}
              loading={decide.isPending}
            >
              {t(restricting === 'ban' ? 'moderation.confirmBan' : 'moderation.confirmSuspend')}
            </Button>
            <Button
              variant="text"
              size="sm"
              onClick={() => {
                setRestricting(null);
              }}
            >
              {t('moderation.cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="row">
          <Button
            variant="secondary"
            size="sm"
            loading={decide.isPending}
            onClick={() => {
              decide.mutate({ decision: 'dismiss' });
            }}
          >
            {t('moderation.dismiss')}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setRestricting('suspend');
            }}
          >
            {t('moderation.suspend')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setRestricting('ban');
            }}
          >
            {t('moderation.ban')}
          </Button>
        </div>
      )}
    </article>
  );
}
