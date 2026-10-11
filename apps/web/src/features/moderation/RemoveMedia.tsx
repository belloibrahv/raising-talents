import type { RejectionCategory } from '@rt/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { api } from '../../shared/api/client';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Select } from '../../shared/ui/Select';
import { useSession } from '../auth/use-auth';

const REASONS: readonly RejectionCategory[] = ['sexual', 'violence', 'hate', 'other'];

interface RemoveMediaProps {
  readonly mediaId: string;
  /** What the button says: a post, or a profile photo. */
  readonly what: 'post' | 'photo';
  /** Whose it is, so each control has its own name on a screen full of them. */
  readonly owner: string;
  /** Called once it is down, for a list that should let go of it. */
  readonly onRemoved?: () => void;
}

/**
 * Moderators only: takes down a photo or video that is already live. Posts go live without
 * a check first (ADR-048), so this is where a moderator acts. Nobody else sees it.
 */
export function RemoveMedia({ mediaId, what, owner, onRemoved }: RemoveMediaProps) {
  const role = useSession().me?.role;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<RejectionCategory | ''>('');
  const remove = useMutation({
    mutationFn: (category: RejectionCategory) =>
      api.call('moderation.removeMedia', { params: { mediaId }, body: { category } }),
    onSuccess: () => {
      onRemoved?.();
      // A removed post leaves every list. The profile itself is left as it is on screen, so
      // the confirmation stays in view; without its photo it is hidden on the next visit.
      if (what === 'post') {
        void queryClient.invalidateQueries({ queryKey: ['posts'] });
        void queryClient.invalidateQueries({ queryKey: ['social'] });
      }
    },
  });

  if (role !== 'moderator' && role !== 'admin') return null;
  if (remove.isSuccess) {
    return (
      <p className="m-0 text-sm text-muted-foreground" role="status">
        {t(what === 'post' ? 'moderation.removed' : 'moderation.removedPhoto')}
      </p>
    );
  }
  if (!open) {
    return (
      <Button
        variant="text"
        size="sm"
        className="w-fit text-destructive"
        aria-label={t(`moderation.remove.${what}Of`, { name: owner })}
        onClick={() => {
          setOpen(true);
        }}
      >
        <ShieldAlert aria-hidden="true" className="size-4" />
        {t(`moderation.remove.${what}`)}
      </Button>
    );
  }
  return (
    <form
      className="stack rounded-xl border bg-background p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (reason) remove.mutate(reason);
      }}
    >
      <FormMessage tone="error">{remove.error ? errorMessage(remove.error) : null}</FormMessage>
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
      <p className="m-0 text-sm text-muted-foreground">{t('moderation.remove.body')}</p>
      <div className="row">
        <Button type="submit" size="sm" disabled={!reason} loading={remove.isPending}>
          {t('moderation.remove.confirm')}
        </Button>
        <Button
          variant="text"
          size="sm"
          onClick={() => {
            setOpen(false);
          }}
        >
          {t('moderation.cancel')}
        </Button>
      </div>
    </form>
  );
}
