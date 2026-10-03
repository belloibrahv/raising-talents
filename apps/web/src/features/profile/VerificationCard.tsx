import { Link } from 'react-router';
import { t } from '../../i18n';
import { useMyVerification } from './verification-queries';

/** The agent's verification at a glance, with the next step. */
export function VerificationCard() {
  const verification = useMyVerification();
  const data = verification.data;
  if (!data) return null;
  const date = data.submittedAt
    ? new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(data.submittedAt))
    : '';
  return (
    <section className="card" aria-labelledby="verification-heading">
      <h2 id="verification-heading" className="field__label">
        {t('verification.title')}
      </h2>
      {data.state === 'verified' ? (
        <p>
          <span className="badge badge--ready">{t('talent.verified')}</span>{' '}
          {t('verification.verified')}
        </p>
      ) : data.state === 'pending' ? (
        <p>{t('verification.pending', { date })}</p>
      ) : data.state === 'declined' ? (
        <p className="message message--error">
          {t('verification.declined', { reason: data.declineReason ?? '' })}
        </p>
      ) : null}
      {data.canRequest ? (
        <Link className="button button--primary" to="/verification">
          {data.state === 'declined' ? t('verification.tryAgain') : t('verification.start')}
        </Link>
      ) : data.state === 'not_requested' ? (
        <p className="field__hint">{t('verification.notReady')}</p>
      ) : null}
    </section>
  );
}
