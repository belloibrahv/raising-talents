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
        <p className="page__subtitle">{t('moderation.agentsEmpty')}</p>
      ) : null}
      <ul className="stack" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
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
    <article className="card" aria-labelledby={headingId}>
      <h2 id={headingId} className="field__label">
        {t('moderation.agentHeading', { agency: item.agencyName, name: item.city?.name ?? '' })}
      </h2>
      {item.previouslyDeclined > 0 ? (
        <p className="badge badge--rejected">
          {t('moderation.previouslyDeclined', { count: item.previouslyDeclined })}
        </p>
      ) : null}
      <dl className="facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="field__hint">{label}</dt>
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
            <Button
              type="submit"
              className="button--small"
              disabled={!reason}
              loading={decide.isPending}
            >
              {t('moderation.confirmDecline')}
            </Button>
            <Button
              variant="text"
              className="button--small"
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
            className="button--small"
            loading={decide.isPending}
            onClick={() => {
              decide.mutate({ decision: 'approve' });
            }}
          >
            {t('moderation.verify')}
          </Button>
          <Button
            variant="secondary"
            className="button--small"
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
