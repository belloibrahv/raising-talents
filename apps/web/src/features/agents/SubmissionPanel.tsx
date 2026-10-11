import { CONTACT_MESSAGE_MAX, CONTACT_MESSAGE_MIN, type RosterStatus } from '@rt/contracts';
import { CheckCircle2, Clock3, Send } from 'lucide-react';
import { useState, type ReactNode, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { Button, buttonLink } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { TextArea } from '../../shared/ui/TextArea';
import { useSession } from '../auth/use-auth';
import { useConversationWithAgent, useSubmitToAgent } from '../messages/queries';

const panel = 'stack gap-3 rounded-2xl border bg-card p-5 text-card-foreground shadow-xs sm:p-6';

interface SubmissionPanelProps {
  readonly agentId: string;
  readonly name: string;
  readonly rosterStatus: RosterStatus | null;
}

/**
 * How a talent reaches an agent from the agent's page: a submission when the agent is open
 * for them, or the conversation the two already have (ADR-050). Agents who are not open
 * get a plain note; they can still write first.
 */
export function SubmissionPanel({ agentId, name, rosterStatus }: SubmissionPanelProps) {
  const me = useSession().me;
  const isTalent = me?.role === 'talent';
  const existing = useConversationWithAgent(agentId, isTalent);
  if (!isTalent || existing.isPending) return null;

  const conversation = existing.data;
  if (conversation && conversation.status !== 'withdrawn') {
    const open = (
      <div>
        <Link className={buttonLink('primary', 'sm')} to={`/messages/${conversation.id}`}>
          {t('contact.open')}
        </Link>
      </div>
    );
    if (conversation.status === 'accepted') {
      return (
        <Panel icon={CheckCircle2} title={t('contact.chatOpen', { name })}>
          {open}
        </Panel>
      );
    }
    if (conversation.status === 'requested') {
      return conversation.awaitingMyAnswer ? (
        <Panel icon={Clock3} title={t('submission.theyAsked', { name })}>
          {open}
        </Panel>
      ) : (
        <Panel icon={Clock3} title={t('submission.waiting', { name })}>
          {open}
        </Panel>
      );
    }
    // Declined: only shown to the one who asked, so this is the talent's own submission.
    return <Panel icon={Clock3} title={t('submission.declined', { name })} />;
  }

  if (rosterStatus !== 'open') {
    return (
      <p className="m-0 max-w-2xl rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
        {t(rosterStatus === 'full' ? 'agents.howContactFull' : 'agents.howContact')}
      </p>
    );
  }
  return <SubmissionForm agentId={agentId} name={name} />;
}

function Panel({
  icon: Icon,
  title,
  children,
}: {
  readonly icon: typeof Clock3;
  readonly title: string;
  readonly children?: ReactNode;
}) {
  return (
    <section className={panel} aria-labelledby="submission-heading">
      <h2 id="submission-heading" className="flex items-start gap-3 text-lg font-semibold">
        <Icon aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function SubmissionForm({ agentId, name }: { readonly agentId: string; readonly name: string }) {
  const submit = useSubmitToAgent();
  const [message, setMessage] = useState('');
  const [tooShort, setTooShort] = useState(false);
  // Made once, so pressing Send again after a timeout cannot send two submissions.
  const [clientMessageId] = useState(() => crypto.randomUUID());
  return (
    <section className={panel} aria-labelledby="submission-heading">
      <h2 id="submission-heading" className="flex items-start gap-3 text-lg font-semibold">
        <Send aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" />
        {t('submission.title', { name })}
      </h2>
      <p className="m-0 text-sm text-muted-foreground">{t('submission.body')}</p>
      <form
        className="stack gap-3"
        noValidate
        onSubmit={(event: SubmitEvent) => {
          event.preventDefault();
          if (message.trim().length < CONTACT_MESSAGE_MIN) {
            setTooShort(true);
            return;
          }
          submit.mutate({ agentId, message: message.trim(), clientMessageId });
        }}
      >
        <FormMessage tone="error">{submit.error ? errorMessage(submit.error) : null}</FormMessage>
        <TextArea
          label={t('submission.message')}
          hint={t('submission.messageHint')}
          value={message}
          maxLength={CONTACT_MESSAGE_MAX}
          error={tooShort ? t('submission.tooShort') : undefined}
          onChange={(event) => {
            setMessage(event.target.value);
            if (tooShort && event.target.value.trim().length >= CONTACT_MESSAGE_MIN) {
              setTooShort(false);
            }
          }}
        />
        <div>
          <Button type="submit" loading={submit.isPending}>
            <Send aria-hidden="true" />
            {t('submission.send')}
          </Button>
        </div>
      </form>
    </section>
  );
}
