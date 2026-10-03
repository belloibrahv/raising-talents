import type { ConversationSummary, Counterpart } from '@rt/contracts';
import { Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { VerifiedBadge } from '../../shared/ui/VerifiedBadge';

export const counterpartName = (counterpart: Counterpart): string =>
  counterpart.kind === 'talent' ? counterpart.displayName : counterpart.agencyName;

/** The talent's photo, or the agency's mark: agents have no personal photo. */
export function CounterpartAvatar({
  counterpart,
  size = 'md',
}: {
  readonly counterpart: Counterpart;
  readonly size?: 'md' | 'lg';
}) {
  const box = size === 'lg' ? 'size-14 text-xl' : 'size-12 text-lg';
  if (counterpart.kind === 'talent' && counterpart.avatarUrls) {
    return (
      <img
        className={cn(box, 'shrink-0 rounded-full bg-muted object-cover')}
        src={counterpart.avatarUrls.small}
        alt=""
        loading="lazy"
        decoding="async"
      />
    );
  }
  return (
    <span
      className={cn(
        box,
        'grid shrink-0 place-items-center rounded-full font-display font-bold',
        counterpart.kind === 'agent'
          ? 'bg-stage text-stage-foreground'
          : 'bg-muted text-muted-foreground',
      )}
      aria-hidden="true"
    >
      {counterpart.kind === 'agent' ? (
        <Building2 className={size === 'lg' ? 'size-6' : 'size-5'} />
      ) : (
        counterpart.displayName.slice(0, 1)
      )}
    </span>
  );
}

/** Who they are, in one line under the name. */
export function counterpartDetail(counterpart: Counterpart): string {
  if (counterpart.kind === 'talent') {
    return counterpart.available ? `@${counterpart.handle}` : t('messages.unavailable');
  }
  return [counterpart.jobTitle, counterpart.city].filter(Boolean).join(' · ');
}

export function CounterpartVerified({ counterpart }: { readonly counterpart: Counterpart }) {
  return counterpart.kind === 'agent' && counterpart.verified ? (
    <VerifiedBadge label={t('messages.verifiedAgency')} />
  ) : null;
}

/** The short status word for the list, from the viewer's side. */
export function statusLabel(conversation: ConversationSummary): string | null {
  switch (conversation.status) {
    case 'requested':
      return conversation.awaitingMyAnswer
        ? t('messages.status.requested')
        : t('messages.status.waiting');
    case 'declined':
      return t('messages.status.declined');
    case 'withdrawn':
      return t('messages.status.withdrawn');
    case 'accepted':
      return null;
  }
}
