import type { ConversationSummary } from '@rt/contracts';
import { ChevronRight, MessagesSquare } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { Button, buttonLink } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { FormMessage } from '../../shared/ui/FormMessage';
import { PageSkeleton } from '../../shared/ui/PageSkeleton';
import { Page } from '../../shared/ui/Page';
import { useSession } from '../auth/use-auth';
import { counterpartDetail, counterpartName, CounterpartAvatar, statusLabel } from './Counterpart';
import { shortTime } from './time';
import { useConversations } from './queries';

/** Requests and chats, newest activity first. */
export function MessagesPage() {
  const me = useSession().me;
  const conversations = useConversations();
  const isAgent = me?.role === 'agent';
  if (conversations.isPending) return <PageSkeleton />;
  const items = conversations.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Page
      title={t('messages.title')}
      documentTitle={t('titles.messages')}
      subtitle={isAgent ? t('messages.subtitleAgent') : t('messages.subtitleTalent')}
    >
      <FormMessage tone="error">
        {conversations.error ? errorMessage(conversations.error) : null}
      </FormMessage>
      {conversations.isSuccess && items.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title={isAgent ? t('messages.emptyAgent') : t('messages.emptyTalent')}
          description={isAgent ? t('messages.emptyAgentBody') : t('messages.emptyTalentBody')}
        >
          {isAgent ? (
            <Link className={buttonLink('primary', 'sm')} to="/search">
              {t('home.findTalent')}
            </Link>
          ) : null}
        </EmptyState>
      ) : null}
      {items.length > 0 ? (
        <ul className="m-0 list-none divide-y overflow-hidden rounded-2xl border bg-card p-0 shadow-xs">
          {items.map((conversation) => (
            <li key={conversation.id}>
              <ConversationRow conversation={conversation} />
            </li>
          ))}
        </ul>
      ) : null}
      {conversations.hasNextPage ? (
        <Button
          variant="secondary"
          loading={conversations.isFetchingNextPage}
          onClick={() => void conversations.fetchNextPage()}
        >
          {t('messages.loadMore')}
        </Button>
      ) : null}
    </Page>
  );
}

function ConversationRow({ conversation }: { readonly conversation: ConversationSummary }) {
  const { counterpart, lastMessage, unread } = conversation;
  const status = statusLabel(conversation);
  const needsMe = conversation.awaitingMyAnswer || unread > 0;
  const preview = lastMessage
    ? `${lastMessage.mine ? t('messages.you') : ''}${lastMessage.body}`
    : '';
  return (
    <Link
      to={`/messages/${conversation.id}`}
      className={cn(
        'flex items-center gap-4 p-4 text-card-foreground no-underline transition-colors hover:bg-accent/60 sm:px-5',
        needsMe && 'bg-spotlight/10',
      )}
    >
      <CounterpartAvatar counterpart={counterpart} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={cn('truncate text-base', needsMe ? 'font-bold' : 'font-semibold')}>
            {counterpartName(counterpart)}
          </span>
          <time
            className="ml-auto shrink-0 text-xs text-muted-foreground"
            dateTime={conversation.updatedAt}
          >
            {shortTime(conversation.updatedAt)}
          </time>
        </div>
        <p className="m-0 truncate text-sm text-muted-foreground">
          {counterpartDetail(counterpart)}
        </p>
        <div className="mt-1 flex items-center gap-2">
          {status ? (
            <Badge variant={conversation.awaitingMyAnswer ? 'spotlight' : 'secondary'}>
              {status}
            </Badge>
          ) : null}
          <p
            className={cn(
              'm-0 min-w-0 flex-1 truncate text-sm',
              unread > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground',
            )}
          >
            {preview}
          </p>
          {unread > 0 ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[11px] font-bold text-destructive-foreground">
              <span aria-hidden="true">{unread > 9 ? '9+' : unread}</span>
              <span className="sr-only">{t('messages.unreadCount', { count: unread })}</span>
            </span>
          ) : null}
        </div>
      </div>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
    </Link>
  );
}
