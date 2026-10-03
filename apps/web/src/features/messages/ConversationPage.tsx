import { MESSAGE_MAX, type ConversationSummary, type Message } from '@rt/contracts';
import { ArrowLeft, Clock3, Info, MessageSquareOff, Send, ShieldCheck } from 'lucide-react';
import { Fragment, useEffect, useState, type ReactNode, type SubmitEvent } from 'react';
import { Link, useParams } from 'react-router';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { Button, buttonLink } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { FormMessage } from '../../shared/ui/FormMessage';
import { PageSkeleton } from '../../shared/ui/PageSkeleton';
import { Page } from '../../shared/ui/Page';
import { TextArea } from '../../shared/ui/TextArea';
import {
  counterpartDetail,
  counterpartName,
  CounterpartAvatar,
  CounterpartVerified,
} from './Counterpart';
import {
  useConversation,
  useMarkConversationRead,
  useRespond,
  useSendMessage,
  useThread,
  useWithdraw,
} from './queries';
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
      {counterpart.kind === 'agent' ? (
        <p className="flex items-start gap-3 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-foreground" />
          {t('messages.safety')}
        </p>
      ) : null}
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
                      ? 'rounded-br-md bg-stage text-stage-foreground'
                      : 'rounded-bl-md border bg-card text-card-foreground',
                  )}
                >
                  <span className="sr-only">{message.mine ? t('messages.you') : `${name}: `}</span>
                  <p className="m-0 break-words whitespace-pre-wrap">{message.body}</p>
                  <time
                    dateTime={message.sentAt}
                    className={cn(
                      'mt-1 block text-right text-[11px]',
                      message.mine ? 'text-stage-foreground/70' : 'text-muted-foreground',
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
  if (summary.awaitingMyAnswer) return <Answer summary={summary} name={name} />;
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
  return (
    <form
      className="stack gap-3 rounded-2xl border bg-card p-4 shadow-xs"
      noValidate
      onSubmit={(event: SubmitEvent) => {
        event.preventDefault();
        submit();
      }}
    >
      <FormMessage tone="error">{send.error ? errorMessage(send.error) : null}</FormMessage>
      <TextArea
        label={t('messages.composer')}
        value={body}
        maxLength={MESSAGE_MAX}
        rows={3}
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
      <div className="flex justify-end">
        <Button type="submit" loading={send.isPending} disabled={body.trim().length === 0}>
          <Send aria-hidden="true" />
          {t('messages.send')}
        </Button>
      </div>
    </form>
  );
}
