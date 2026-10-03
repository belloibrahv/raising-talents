import { useMutation } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { api, session } from '../../shared/api/client';
import { Button } from '../../shared/ui/Button';
import { useSession } from '../auth/use-auth';

/** On every signed-in screen while deletion is pending, so it is never a surprise. */
export function DeletionBanner() {
  const scheduledAt = useSession().me?.deletionScheduledAt;
  const keep = useMutation({
    mutationFn: () => api.call('privacy.cancelDeletion'),
    onSuccess: (me) => {
      session.signedIn(me);
    },
  });
  if (!scheduledAt) return null;
  const date = new Intl.DateTimeFormat('en-NG', { dateStyle: 'long' }).format(
    new Date(scheduledAt),
  );
  return (
    <section
      className="border-b border-destructive/30 bg-destructive-surface text-destructive"
      role="region"
      aria-label={t('account.deleteTitle')}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-6">
        <p className="flex flex-1 items-start gap-2 font-medium">
          <CalendarClock aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t('account.scheduled', { date })}
        </p>
        {keep.error ? <p role="alert">{errorMessage(keep.error)}</p> : null}
        <Button
          size="sm"
          loading={keep.isPending}
          onClick={() => {
            keep.mutate();
          }}
        >
          {t('account.keep')}
        </Button>
      </div>
    </section>
  );
}
