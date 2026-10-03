import type {
  VerificationDeclineCategory,
  VerificationForReview,
  VerificationQueuePage,
} from '@rt/contracts';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { api } from '../../shared/api/client';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { Select } from '../../shared/ui/Select';
import { ModerationTabs } from './ModerationTabs';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck } from 'lucide-react';
import { EmptyState } from '../../shared/ui/EmptyState';

const QUEUE_KEY = ['moderation', 'agents'] as const;
const REASONS: readonly VerificationDeclineCategory[] = [
  'agency_not_confirmed',
  'details_do_not_match',
  'evidence_unreachable',
  'other',
];

export function AgentQueuePage() {
  const [announcement, setAnnouncement] = useState('');
  const queue = useInfiniteQuery({
    queryKey: QUEUE_KEY,
    queryFn: ({ pageParam }) =>
      api.call('moderation.agentVerifications', { query: pageParam ? { cursor: pageParam } : {} }),
    initialPageParam: '',
    getNextPageParam: (last: VerificationQueuePage) => last.nextCursor ?? undefined,
  });
  const items = queue.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Page
      title={t('moderation.agentsTitle')}
      documentTitle={t('titles.moderationAgents')}
      subtitle={t('moderation.agentsBody')}
      hero={<ModerationTabs />}
    >
      <div className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </div>
      <FormMessage tone="error">{queue.error ? errorMessage(queue.error) : null}</FormMessage>
      {queue.data && items.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t('moderation.agentsEmpty')} />
      ) : null}
      <ul className="stack m-0 list-none p-0">
        {items.map((item) => (
          <li key={item.id}>
            <AgentRequest item={item} onDecided={setAnnouncement} />
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

function AgentRequest({
  item,
  onDecided,
}: {
  readonly item: VerificationForReview;
  readonly onDecided: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState<VerificationDeclineCategory | ''>('');
  const decide = useMutation({
    mutationFn: (
      decision:
        { decision: 'approve' } | { decision: 'decline'; category: VerificationDeclineCategory },
    ) =>
      api.call('moderation.decideAgentVerification', {
        params: { requestId: item.id },
        body: decision,
      }),
    onSuccess: async (_result, decision) => {
      onDecided(
        decision.decision === 'approve'
          ? t('moderation.agentVerified')
          : t('moderation.agentDeclined'),
      );
      await queryClient.invalidateQueries({ queryKey: QUEUE_KEY });
    },
  });
  const headingId = `verification-${item.id}`;
  const facts: [string, React.ReactNode][] = [
    [t('moderation.jobTitle'), item.jobTitle],
    [t('moderation.email'), item.email],
    [
      t('moderation.evidence'),
      <a key="evidence" href={item.evidenceUrl} target="_blank" rel="noreferrer noopener">
        {item.evidenceUrl}
      </a>,
    ],
    [t('moderation.registration'), item.registrationNumber ?? t('moderation.none')],
    [t('moderation.website'), item.website ?? t('moderation.none')],
    [t('moderation.noteLabel'), item.note || t('moderation.none')],
  ];
  return (
    <article
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
      aria-labelledby={headingId}
    >
      <h2 id={headingId} className="text-base font-semibold">
        {t('moderation.agentHeading', { agency: item.agencyName, name: item.city?.name ?? '' })}
      </h2>
      {item.previouslyDeclined > 0 ? (
        <Badge variant="destructive">
          {t('moderation.previouslyDeclined', { count: item.previouslyDeclined })}
        </Badge>
      ) : null}
      <dl className="m-0 grid gap-x-6 gap-y-3 sm:grid-cols-2 [&_dd]:m-0 [&_dd]:break-words">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <FormMessage tone="error">{decide.error ? errorMessage(decide.error) : null}</FormMessage>
      {declining ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason) decide.mutate({ decision: 'decline', category: reason });
          }}
        >
          <Select
            label={t('moderation.reason')}
            placeholder={t('moderation.chooseReason')}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value as VerificationDeclineCategory | '');
            }}
            options={REASONS.map((category) => ({
              value: category,
              label: t(`moderation.${category}`),
            }))}
            required
          />
          <div className="row">
            <Button type="submit" size="sm" disabled={!reason} loading={decide.isPending}>
              {t('moderation.confirmDecline')}
            </Button>
            <Button
              variant="text"
              size="sm"
              onClick={() => {
                setDeclining(false);
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
            {t('moderation.verify')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setDeclining(true);
            }}
          >
            {t('moderation.decline')}
          </Button>
        </div>
      )}
    </article>
  );
}
