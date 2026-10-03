import { VERIFICATION_CODE_LENGTH } from '@rt/contracts';
import { useState, type SubmitEvent } from 'react';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { ApiError } from '../../shared/api/api-error';
import { Link, Navigate } from 'react-router';
import { Button, buttonLink } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { TextField } from '../../shared/ui/TextField';
import { useCountdown } from './use-countdown';
import { useResendCode, useSession, useSignOut, useVerifyEmail } from './use-auth';

/** Matches the server's resend cooldown. The first code was sent at sign-up. */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Verifying is optional until it is needed (ADR-037): people reach this from the banner or
 * their account page, and can leave at any time to keep exploring.
 */
export function VerifyEmailPage() {
  const me = useSession().me;
  const email = me?.email ?? '';
  // The session flips to verified before the mutation's own callbacks run, so the page
  // remembers how it opened: already verified means there is nothing to do here.
  const [openedVerified] = useState(() => me?.emailVerified === true);
  const verify = useVerifyEmail();
  const resend = useResendCode();
  const signOut = useSignOut();
  const [code, setCode] = useState('');
  const [secondsLeft, restartCountdown] = useCountdown(RESEND_COOLDOWN_SECONDS);

  const submit = (value: string) => {
    if (value.length !== VERIFICATION_CODE_LENGTH || verify.isPending) return;
    verify.mutate(value, {
      onError: () => {
        setCode('');
      },
    });
  };

  const requestNewCode = () => {
    verify.reset();
    resend.mutate(undefined, {
      onSuccess: () => {
        restartCountdown(RESEND_COOLDOWN_SECONDS);
      },
      onError: (error) => {
        if (error instanceof ApiError && error.problem.retryAfterSeconds) {
          restartCountdown(error.problem.retryAfterSeconds);
        }
      },
    });
  };

  const error = verify.error ?? resend.error;

  if (openedVerified) return <Navigate to="/home" replace />;
  if (me?.emailVerified) {
    return (
      <Page title={t('verifyEmail.doneTitle')} subtitle={t('verifyEmail.doneBody')}>
        <Link className={buttonLink('primary')} to="/home">
          {t('verifyEmail.continue')}
        </Link>
      </Page>
    );
  }

  const why = me?.role === 'agent' ? t('verifyEmail.whyAgent') : t('verifyEmail.whyTalent');
  return (
    <Page title={t('verifyEmail.title')} subtitle={`${t('verifyEmail.body', { email })} ${why}`}>
      <form
        className="stack"
        noValidate
        onSubmit={(event: SubmitEvent) => {
          event.preventDefault();
          submit(code);
        }}
      >
        <FormMessage tone="error">{error ? errorMessage(error) : null}</FormMessage>
        <FormMessage tone="success">
          {resend.isSuccess ? t('verifyEmail.resent') : null}
        </FormMessage>
        <TextField
          label={t('verifyEmail.codeLabel')}
          value={code}
          onChange={(event) => {
            const digits = event.target.value.replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH);
            if (verify.error) verify.reset();
            setCode(digits);
            // Codes pasted or filled from the email submit themselves.
            if (digits.length === VERIFICATION_CODE_LENGTH) submit(digits);
          }}
          error={verify.isError ? t('validation.codeInvalid') : undefined}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={VERIFICATION_CODE_LENGTH}
          inputClassName="h-16 text-center font-mono text-3xl tracking-[0.5em] tabular-nums"
          required
        />
        <Button
          type="submit"
          loading={verify.isPending}
          disabled={code.length !== VERIFICATION_CODE_LENGTH}
        >
          {t('verifyEmail.submit')}
        </Button>
        <Button
          variant="text"
          onClick={requestNewCode}
          disabled={secondsLeft > 0}
          loading={resend.isPending}
        >
          {secondsLeft > 0
            ? t('verifyEmail.resendIn', { seconds: secondsLeft })
            : t('verifyEmail.resend')}
        </Button>
        <Link className={buttonLink('secondary')} to={me?.role ? '/home' : '/choose-role'}>
          {t('verifyEmail.later')}
        </Link>
        <Button
          variant="text"
          onClick={() => {
            signOut.mutate();
          }}
        >
          {t('verifyEmail.wrongEmail')}
        </Button>
      </form>
    </Page>
  );
}
