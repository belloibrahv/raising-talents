import { Link } from 'react-router';
import { t } from '../../i18n';
import { useMyVerification } from './verification-queries';
import { buttonLink } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { VerifiedBadge } from '../../shared/ui/VerifiedBadge';

/** The agent's verification at a glance, with the next step. */
export function VerificationCard() {
  const verification = useMyVerification();
  const data = verification.data;
  if (!data) return null;
  const date = data.submittedAt
    ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(data.submittedAt))
    : '';
  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
      aria-labelledby="verification-heading"
    >
      <h2 id="verification-heading" className="text-base font-semibold">
        {t('verification.title')}
      </h2>
      {data.state === 'verified' ? (
        <p>
          <VerifiedBadge /> {t('verification.verified')}
        </p>
      ) : data.state === 'pending' ? (
        <p>{t('verification.pending', { date })}</p>
      ) : data.state === 'declined' ? (
        <FormMessage announce={false} tone="error">
          {t('verification.declined', { reason: data.declineReason ?? '' })}
        </FormMessage>
      ) : null}
      {data.canRequest ? (
        <Link className={buttonLink('primary')} to="/verification">
          {data.state === 'declined' ? t('verification.tryAgain') : t('verification.start')}
        </Link>
      ) : data.state === 'not_requested' ? (
        <p className="text-sm text-muted-foreground">{t('verification.notReady')}</p>
      ) : null}
    </section>
  );
}
