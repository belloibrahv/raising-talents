import { CONTACT_MESSAGE_MAX, CONTACT_MESSAGE_MIN } from '@rt/contracts';
import { BadgeCheck, CheckCircle2, Clock3, MailWarning, MessageCircleMore } from 'lucide-react';
import { useState, type ReactNode, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { Button, buttonLink } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { TextArea } from '../../shared/ui/TextArea';
import { useSession } from '../auth/use-auth';
import { useMyVerification } from '../profile/verification-queries';
import { useConversationWithTalent, useRequestContact } from './queries';

const panel = 'stack gap-3 rounded-2xl border bg-card p-5 text-card-foreground shadow-xs sm:p-6';

/**
 * How an agent reaches a talent from the profile: a request with an introduction, or the
 * conversation they already have (ADR-011, ADR-038).
 */
export function ContactPanel({ handle, name }: { readonly handle: string; readonly name: string }) {
  const me = useSession().me;
  const verification = useMyVerification();
  const existing = useConversationWithTalent(handle, true);
  if (!me || verification.isPending || existing.isPending) return null;

  const conversation = existing.data;
  // Only a talent viewer is ever refused; an agent never sees this.
  if (conversation === 'not-allowed') return null;
  if (conversation && conversation.status !== 'withdrawn') {
    const open = (
      <Link className={buttonLink('secondary', 'sm')} to={`/messages/${conversation.id}`}>
        {t('contact.open')}
      </Link>
    );
    if (conversation.status === 'accepted') {
      return (
        <Panel icon={CheckCircle2} title={t('contact.chatOpen', { name })}>
          <div>{open}</div>
        </Panel>
      );
    }
    if (conversation.status === 'requested') {
      return (
        <Panel icon={Clock3} title={t('contact.waiting', { name })}>
          <div>{open}</div>
        </Panel>
      );
    }
    return <Panel icon={Clock3} title={t('contact.declined', { name })} />;
  }

  if (!me.emailVerified) {
    return (
      <Panel icon={MailWarning} title={t('contact.needEmail')}>
        <div>
          <Link className={buttonLink('secondary', 'sm')} to="/verify-email">
            {t('contact.verifyEmail')}
          </Link>
        </div>
      </Panel>
    );
  }
  const state = verification.data?.state;
  if (state !== 'verified') {
    return (
      <Panel
        icon={BadgeCheck}
        title={t('contact.needVerified')}
        body={state === 'pending' ? t('contact.pending') : t('contact.needVerifiedBody')}
      >
        {state === 'pending' ? null : (
          <div>
            <Link className={buttonLink('secondary', 'sm')} to="/verification">
              {t('contact.getVerified')}
            </Link>
          </div>
        )}
      </Panel>
    );
  }
  return <RequestForm handle={handle} name={name} copy={AGENT_COPY} />;
}

/**
 * How one talent reaches another from their profile (ADR-061): the same request and answer
 * as an agent's, without agency verification. Nothing shows for a talent in the other age
 * group, or for a profile the viewer cannot write to.
 */
export function TalentMessagePanel({
  handle,
  name,
}: {
  readonly handle: string;
  readonly name: string;
}) {
  const me = useSession().me;
  const existing = useConversationWithTalent(handle, true);
  if (!me || existing.isPending || existing.isError) return null;
  const conversation = existing.data;
  if (conversation === 'not-allowed') return null;
  if (conversation && conversation.status !== 'withdrawn') {
    const open = (
      <Link className={buttonLink('secondary', 'sm')} to={`/messages/${conversation.id}`}>
        {t('contact.open')}
      </Link>
    );
    if (conversation.status === 'accepted') {
      return (
        <Panel icon={CheckCircle2} title={t('contact.chatOpen', { name })}>
          <div>{open}</div>
        </Panel>
      );
    }
    if (conversation.status === 'requested') {
      return (
        <Panel
          icon={Clock3}
          title={
            conversation.awaitingMyAnswer
              ? t('contact.peerWroteToYou', { name })
              : t('contact.waiting', { name })
          }
        >
          <div>{open}</div>
        </Panel>
      );
    }
    return <Panel icon={Clock3} title={t('contact.declined', { name })} />;
  }
  if (!me.emailVerified) {
    return (
      <Panel icon={MailWarning} title={t('contact.peerNeedEmail')}>
        <div>
          <Link className={buttonLink('secondary', 'sm')} to="/verify-email">
            {t('contact.verifyEmail')}
          </Link>
        </div>
      </Panel>
    );
  }
  return <RequestForm handle={handle} name={name} copy={PEER_COPY} />;
}

const AGENT_COPY = {
  title: 'contact.title',
  body: 'contact.body',
  hint: 'contact.messageHint',
  send: 'contact.send',
} as const;

const PEER_COPY = {
  title: 'contact.peerTitle',
  body: 'contact.peerBody',
  hint: 'contact.peerMessageHint',
  send: 'contact.peerSend',
} as const;

function Panel({
  icon: Icon,
  title,
  body,
  children,
}: {
  readonly icon: typeof Clock3;
  readonly title: string;
  readonly body?: string;
  readonly children?: ReactNode;
}) {
  return (
    <section className={panel} aria-labelledby="contact-heading">
      <h2 id="contact-heading" className="flex items-start gap-3 text-lg font-semibold">
        <Icon aria-hidden="true" className="mt-1 size-5 shrink-0 text-muted-foreground" />
        {title}
      </h2>
      {body ? <p className="m-0 text-sm text-muted-foreground">{body}</p> : null}
      {children}
    </section>
  );
}

function RequestForm({
  handle,
  name,
  copy,
}: {
  readonly handle: string;
  readonly name: string;
  readonly copy: typeof AGENT_COPY | typeof PEER_COPY;
}) {
  const request = useRequestContact();
  const [message, setMessage] = useState('');
  const [tooShort, setTooShort] = useState(false);
  // Made once, so pressing Send again after a timeout cannot send two requests.
  const [clientMessageId] = useState(() => crypto.randomUUID());
  return (
    <section className={panel} aria-labelledby="contact-heading">
      <h2 id="contact-heading" className="flex items-start gap-3 text-lg font-semibold">
        <MessageCircleMore
          aria-hidden="true"
          className="mt-1 size-5 shrink-0 text-muted-foreground"
        />
        {t(copy.title, { name })}
      </h2>
      <p className="m-0 text-sm text-muted-foreground">{t(copy.body, { name })}</p>
      <form
        className="stack gap-3"
        noValidate
        onSubmit={(event: SubmitEvent) => {
          event.preventDefault();
          if (message.trim().length < CONTACT_MESSAGE_MIN) {
            setTooShort(true);
            return;
          }
          request.mutate({ handle, message: message.trim(), clientMessageId });
        }}
      >
        <FormMessage tone="error">{request.error ? errorMessage(request.error) : null}</FormMessage>
        <TextArea
          label={t('contact.message')}
          hint={t(copy.hint)}
          value={message}
          maxLength={CONTACT_MESSAGE_MAX}
          error={tooShort ? t('contact.tooShort') : undefined}
          onChange={(event) => {
            setMessage(event.target.value);
            if (tooShort && event.target.value.trim().length >= CONTACT_MESSAGE_MIN) {
              setTooShort(false);
            }
          }}
        />
        <div>
          <Button type="submit" loading={request.isPending}>
            {t(copy.send)}
          </Button>
        </div>
      </form>
    </section>
  );
}
