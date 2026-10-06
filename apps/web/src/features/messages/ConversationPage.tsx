import { MESSAGE_MAX, type ConversationSummary, type Message } from '@rt/contracts';
import { ArrowLeft, Ban, Clock3, Info, MessageSquareOff, Send } from 'lucide-react';
import { Fragment, useEffect, useState, type ReactNode, type SubmitEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { Button, buttonLink } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { FormMessage } from '../../shared/ui/FormMessage';
import { PageSkeleton } from '../../shared/ui/PageSkeleton';
import { Page } from '../../shared/ui/Page';
import {
  counterpartDetail,
  counterpartName,
  CounterpartAvatar,
  CounterpartVerified,
} from './Counterpart';
import {
  useBlock,
  useConversation,
  useMarkConversationRead,
  useRespond,
  useSendMessage,
  useThread,
  useWithdraw,
} from './queries';
import { ReportConversation } from '../talents/ReportProfile';
import { AgencyCard } from './AgencyCard';
import { dayHeading, dayKey, timeOfDay } from './time';

/** One conversation: the request and its answer, then the chat (ADR-038). */
export function ConversationPage() {
  const { conversationId = '' } = useParams();
  const conversation = useConversation(conversationId);
  const thread = useThread(conversationId, conversation.isSuccess);
  const markRead = useMarkConversationRead(conversationId);
  const unread = conversation.data?.unread ?? 0;
  const { mutate: markAsRead, isPending: marking, isError: markFailed } = markRead;

  // Opening the conversation reads it; so does a message arriving while it is open.
  // A failed attempt is tried again when something new arrives, not in a loop.
  useEffect(() => {
    if (unread > 0 && !marking && !markFailed) markAsRead();
  }, [unread, marking, markFailed, markAsRead]);
  const { reset: resetMark } = markRead;
  const updatedAt = conversation.data?.updatedAt;
  useEffect(() => {
    resetMark();
  }, [updatedAt, resetMark]);

  if (conversation.isPending) return <PageSkeleton />;
  if (conversation.isError) {
    return (
      <Page title={t('messages.notFound')} documentTitle={t('titles.messages')}>
        {isApiError(conversation.error, 'NOT_FOUND') ? (
          <EmptyState
            icon={MessageSquareOff}
            title={t('messages.notFound')}
            description={t('messages.notFoundBody')}
          >
            <Link className={buttonLink('secondary', 'sm')} to="/messages">
              {t('messages.back')}
            </Link>
          </EmptyState>
        ) : (
          <FormMessage tone="error">{errorMessage(conversation.error)}</FormMessage>
        )}
      </Page>
    );
  }

  const summary = conversation.data;
  const { counterpart } = summary;
  const name = counterpartName(counterpart);
  const messages = [...(thread.data?.pages.flatMap((page) => page.items) ?? [])].reverse();

  return (
    <Page
      title={name}
      documentTitle={t('titles.conversation', { name })}
      subtitle={counterpartDetail(counterpart)}
      hero={
        <div className="flex items-center justify-between gap-3">
          <Link className={buttonLink('text', 'sm')} to="/messages">
            <ArrowLeft aria-hidden="true" />
            {t('messages.back')}
          </Link>
          <div className="flex items-center gap-3">
            <CounterpartVerified counterpart={counterpart} />
            {counterpart.kind === 'talent' && counterpart.available ? (
              <Link className={buttonLink('secondary', 'sm')} to={`/talents/${counterpart.handle}`}>
                {t('messages.viewProfile')}
              </Link>
            ) : null}
            <CounterpartAvatar counterpart={counterpart} size="lg" />
          </div>
        </div>
      }
    >
      {counterpart.kind === 'agent' ? <AgencyCard agent={counterpart} /> : null}
      <section className="stack gap-3" aria-label={t('messages.thread', { name })}>
        {thread.hasNextPage ? (
          <Button
            variant="text"
            loading={thread.isFetchingNextPage}
            onClick={() => void thread.fetchNextPage()}
          >
            {t('messages.earlier')}
          </Button>
        ) : null}
        <Thread messages={messages} name={name} />
      </section>
      <NextStep summary={summary} name={name} />
      <div className="flex flex-wrap items-start gap-2">
        {summary.blockedByMe ? null : <BlockControl summary={summary} name={name} />}
        <ReportConversation conversationId={summary.id} />
      </div>
    </Page>
  );
}

function Thread({
  messages,
  name,
}: {
  readonly messages: readonly Message[];
  readonly name: string;
}) {
  return (
    // A log: screen readers announce messages that arrive, without moving focus.
    <div role="log">
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {messages.map((message, index) => {
          const previous = messages[index - 1];
          const newDay = !previous || dayKey(previous.sentAt) !== dayKey(message.sentAt);
          return (
            <Fragment key={message.id}>
              {newDay ? (
                <li
                  className="my-2 text-center text-xs font-semibold text-muted-foreground"
                  aria-hidden="true"
                >
                  {dayHeading(message.sentAt)}
                </li>
              ) : null}
              <li className={cn('flex', message.mine ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-2.5 shadow-xs sm:max-w-[70%]',
                    message.mine
                      ? 'rounded-br-md bg-primary text-primary-foreground'
                      : 'rounded-bl-md border bg-card text-card-foreground',
                  )}
                >
                  <span className="sr-only">{message.mine ? t('messages.you') : `${name}: `}</span>
                  <p className="m-0 break-words whitespace-pre-wrap">{message.body}</p>
                  <time
                    dateTime={message.sentAt}
                    className={cn(
                      'mt-1 block text-right text-[11px]',
                      message.mine ? 'text-primary-foreground/70' : 'text-muted-foreground',
                    )}
                  >
                    {timeOfDay(message.sentAt)}
                  </time>
                </div>
              </li>
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}

/** What the viewer can do now, which depends on the state and their side. */
function NextStep({
  summary,
  name,
}: {
  readonly summary: ConversationSummary;
  readonly name: string;
}) {
  if (summary.blockedByMe) return <Blocked summary={summary} name={name} />;
  if (summary.awaitingMyAnswer) return <Answer summary={summary} name={name} />;
  // The talent's side of a request they cannot answer: the agent blocked it.
  const viewerIsTalent = summary.counterpart.kind === 'agent';
  if (viewerIsTalent && summary.status !== 'accepted') {
    return summary.status === 'declined' ? (
      <Note icon={Info} title={t('messages.youDeclined', { name })} />
    ) : (
      <Note icon={MessageSquareOff} title={t('messages.closed')} />
    );
  }
  if (summary.status === 'requested') return <Waiting summary={summary} name={name} />;
  if (summary.status === 'withdrawn') {
    return (
      <Note icon={Info} title={t('messages.withdrawnTitle')} body={t('messages.withdrawnBody')} />
    );
  }
  if (summary.status === 'declined') {
    return (
      <Note
        icon={Info}
        title={t('messages.declinedTitle', { name })}
        body={t('messages.declinedBody')}
      />
    );
  }
  return summary.canSend ? (
    <Composer conversationId={summary.id} />
  ) : (
    <Note icon={MessageSquareOff} title={t('messages.closed')} />
  );
}

function Note({
  icon: Icon,
  title,
  body,
  children,
}: {
  readonly icon: typeof Info;
  readonly title: string;
  readonly body?: string;
  readonly children?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border bg-card p-5 text-card-foreground">
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
      <div className="stack gap-2">
        <p className="m-0 font-semibold">{title}</p>
        {body ? <p className="m-0 text-sm text-muted-foreground">{body}</p> : null}
        {children}
      </div>
    </div>
  );
}

function Answer({
  summary,
  name,
}: {
  readonly summary: ConversationSummary;
  readonly name: string;
}) {
  const respond = useRespond(summary.id);
  const [confirming, setConfirming] = useState(false);
  return (
    <section
      className="stack gap-4 rounded-2xl border-2 border-spotlight bg-spotlight/10 p-5"
      aria-labelledby="answer-heading"
    >
      <h2 id="answer-heading" className="text-lg font-semibold">
        {t('messages.requestTitle', { agency: name })}
      </h2>
      <p className="m-0 text-sm">{t('messages.requestBody')}</p>
      <FormMessage tone="error">{respond.error ? errorMessage(respond.error) : null}</FormMessage>
      {confirming ? (
        <div className="stack gap-3" role="group" aria-labelledby="decline-confirm">
          <p id="decline-confirm" className="m-0 font-medium">
            {t('messages.declineConfirm', { agency: name })}
          </p>
          <div className="row gap-2">
            <Button
              variant="danger"
              loading={respond.isPending}
              onClick={() => {
                respond.mutate('decline');
              }}
            >
              {t('messages.declineYes')}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {t('messages.keep')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="row gap-2">
          <Button
            loading={respond.isPending && respond.variables === 'accept'}
            onClick={() => {
              respond.mutate('accept');
            }}
          >
            {t('messages.accept')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setConfirming(true);
            }}
          >
            {t('messages.decline')}
          </Button>
        </div>
      )}
    </section>
  );
}

function Waiting({
  summary,
  name,
}: {
  readonly summary: ConversationSummary;
  readonly name: string;
}) {
  const withdraw = useWithdraw(summary.id);
  return (
    <Note
      icon={Clock3}
      title={t('messages.waitingTitle', { name })}
      body={t('messages.waitingBody')}
    >
      <FormMessage tone="error">{withdraw.error ? errorMessage(withdraw.error) : null}</FormMessage>
      <div>
        <Button
          variant="secondary"
          size="sm"
          loading={withdraw.isPending}
          onClick={() => {
            withdraw.mutate();
          }}
        >
          {t('messages.withdraw')}
        </Button>
      </div>
    </Note>
  );
}

function Blocked({
  summary,
  name,
}: {
  readonly summary: ConversationSummary;
  readonly name: string;
}) {
  const block = useBlock(summary.id);
  const navigate = useNavigate();
  // A talent who unblocks a request they declined has nothing left to do here.
  const leaveAfter = summary.counterpart.kind === 'agent' && summary.status === 'declined';
  return (
    <Note icon={Ban} title={t('messages.blockedTitle', { name })} body={t('messages.blockedBody')}>
      <FormMessage tone="error">{block.error ? errorMessage(block.error) : null}</FormMessage>
      <div>
        <Button
          variant="secondary"
          size="sm"
          loading={block.isPending}
          onClick={() => {
            block.mutate(false, {
              onSuccess: () => {
                if (leaveAfter) void navigate('/messages');
              },
            });
          }}
        >
          {t('messages.unblock', { name })}
        </Button>
      </div>
    </Note>
  );
}

/** A quiet control that asks first. Blocking a request also declines it. */
function BlockControl({
  summary,
  name,
}: {
  readonly summary: ConversationSummary;
  readonly name: string;
}) {
  const block = useBlock(summary.id);
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button
        variant="quiet"
        size="sm"
        className="text-muted-foreground"
        onClick={() => {
          setConfirming(true);
        }}
      >
        <Ban aria-hidden="true" />
        {t('messages.block', { name })}
      </Button>
    );
  }
  return (
    <div
      className="stack w-full gap-3 rounded-2xl border bg-card p-5"
      role="group"
      aria-labelledby="block-confirm"
    >
      <p id="block-confirm" className="m-0 font-semibold">
        {t('messages.blockConfirm', { name })}
      </p>
      <p className="m-0 text-sm text-muted-foreground">
        {summary.awaitingMyAnswer ? t('messages.blockRequestBody') : t('messages.blockBody')}
      </p>
      <FormMessage tone="error">{block.error ? errorMessage(block.error) : null}</FormMessage>
      <div className="row gap-2">
        <Button
          variant="danger"
          size="sm"
          loading={block.isPending}
          onClick={() => {
            block.mutate(true);
          }}
        >
          {t('messages.blockYes')}
        </Button>
        <Button
          variant="text"
          size="sm"
          onClick={() => {
            setConfirming(false);
          }}
        >
          {t('messages.keep')}
        </Button>
      </div>
    </div>
  );
}

/** Sends with an id made once per message, so a retry after a timeout never posts twice. */
function Composer({ conversationId }: { readonly conversationId: string }) {
  const send = useSendMessage(conversationId);
  const [body, setBody] = useState('');
  const [clientMessageId, setClientMessageId] = useState(() => crypto.randomUUID());
  const submit = () => {
    const text = body.trim();
    if (!text || send.isPending) return;
    send.mutate(
      { body: text, clientMessageId },
      {
        onSuccess: () => {
          setBody('');
          setClientMessageId(crypto.randomUUID());
        },
      },
    );
  };
  const nearLimit = body.length > MESSAGE_MAX * 0.9;
  return (
    <form
      className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 -mx-2 grid gap-2 rounded-3xl border bg-card/95 p-2 shadow-lg backdrop-blur md:bottom-4"
      noValidate
      onSubmit={(event: SubmitEvent) => {
        event.preventDefault();
        submit();
      }}
    >
      <FormMessage tone="error">{send.error ? errorMessage(send.error) : null}</FormMessage>
      <div className="flex items-end gap-2">
        <label htmlFor="composer" className="sr-only">
          {t('messages.composer')}
        </label>
        <textarea
          id="composer"
          value={body}
          maxLength={MESSAGE_MAX}
          rows={1}
          placeholder={t('messages.placeholder')}
          aria-describedby={nearLimit ? 'composer-count' : undefined}
          className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none rounded-2xl bg-transparent px-3 py-2.5 text-base outline-none placeholder:text-muted-foreground"
          onChange={(event) => {
            setBody(event.target.value);
            // An edited message is a new message.
            if (send.isError) {
              send.reset();
              setClientMessageId(crypto.randomUUID());
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          className="size-11 shrink-0 rounded-full"
          loading={send.isPending}
          disabled={body.trim().length === 0}
          aria-label={t('messages.send')}
        >
          {send.isPending ? null : <Send aria-hidden="true" />}
        </Button>
      </div>
      {nearLimit ? (
        <p id="composer-count" className="px-3 text-right text-xs text-muted-foreground">
          {t('messages.count', { count: body.length, max: MESSAGE_MAX })}
        </p>
      ) : null}
    </form>
  );
}
