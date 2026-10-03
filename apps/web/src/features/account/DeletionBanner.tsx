import { useMutation } from '@tanstack/react-query';
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
    <section className="deletion-banner" role="region" aria-label={t('account.deleteTitle')}>
      <p>{t('account.scheduled', { date })}</p>
      {keep.error ? <p role="alert">{errorMessage(keep.error)}</p> : null}
      <Button
        className="button--small"
        loading={keep.isPending}
        onClick={() => {
          keep.mutate();
        }}
      >
        {t('account.keep')}
      </Button>
    </section>
  );
}
