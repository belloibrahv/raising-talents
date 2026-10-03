import { PASSWORD_MIN_LENGTH, VERIFICATION_CODE_LENGTH } from '@rt/contracts';
import { useMutation } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { api } from '../../shared/api/client';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { PasswordField, TextField } from '../../shared/ui/TextField';
import { useFocusFirstError } from '../../shared/ui/use-focus-first-error';
import { useCountdown } from './use-countdown';

const RESEND_COOLDOWN_SECONDS = 60;

type Errors = Partial<Record<'code' | 'password', string>>;

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const email = params.get('email') ?? '';
  if (!email) return <Navigate to="/forgot-password" replace />;
  return <ResetForm email={email} />;
}

function ResetForm({ email }: { readonly email: string }) {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const form = useFocusFirstError(errors);
  const [secondsLeft, restartCountdown] = useCountdown(RESEND_COOLDOWN_SECONDS);

  const reset = useMutation({
    mutationFn: () =>
      api.call('auth.resetPassword', { body: { email, code, newPassword: password } }),
  });
  const resend = useMutation({
    mutationFn: () => api.call('auth.requestPasswordReset', { body: { email } }),
    onSuccess: () => {
      restartCountdown(RESEND_COOLDOWN_SECONDS);
    },
  });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: Errors = {};
    if (!new RegExp(`^\\d{${String(VERIFICATION_CODE_LENGTH)}}$`).test(code))
      found.code = t('validation.codeInvalid');
    if (password.length < PASSWORD_MIN_LENGTH) found.password = t('validation.passwordShort');
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    reset.mutate(undefined, {
      onSuccess: () =>
        void navigate('/sign-in', { replace: true, state: { passwordChanged: true } }),
      onError: (error) => {
        if (isApiError(error, 'WEAK_PASSWORD')) setErrors({ password: errorMessage(error) });
        else if (isApiError(error, 'VERIFICATION_CODE_INVALID'))
          setErrors({ code: errorMessage(error) });
      },
    });
  };

  const fieldCodes = ['WEAK_PASSWORD', 'VERIFICATION_CODE_INVALID'] as const;
  const formError =
    reset.error && !fieldCodes.some((errorCode) => isApiError(reset.error, errorCode))
      ? errorMessage(reset.error)
      : resend.error
        ? errorMessage(resend.error)
        : null;

  return (
    <Page
      title={t('resetPassword.title')}
      documentTitle={t('titles.resetPassword')}
      subtitle={t('resetPassword.body', { email })}
    >
      <form ref={form} className="stack" onSubmit={submit} noValidate>
        <FormMessage tone="error">{formError}</FormMessage>
        <FormMessage tone="success">
          {resend.isSuccess ? t('resetPassword.resent') : null}
        </FormMessage>
        {/* Lets password managers save the new password against the right account. */}
        <input type="email" name="email" value={email} autoComplete="username" readOnly hidden />
        <TextField
          label={t('resetPassword.code')}
          value={code}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH));
          }}
          error={errors.code}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={VERIFICATION_CODE_LENGTH}
          inputClassName="field__input--code"
          required
        />
        <PasswordField
          label={t('resetPassword.password')}
          hint={t('resetPassword.passwordHint')}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          error={errors.password}
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
        <Button type="submit" loading={reset.isPending}>
          {t('resetPassword.submit')}
        </Button>
        <Button
          variant="text"
          onClick={() => {
            resend.mutate();
          }}
          disabled={secondsLeft > 0}
          loading={resend.isPending}
        >
          {secondsLeft > 0
            ? t('verifyEmail.resendIn', { seconds: secondsLeft })
            : t('resetPassword.resend')}
        </Button>
        <Link className="button button--text" to="/forgot-password" replace>
          {t('resetPassword.otherEmail')}
        </Link>
      </form>
    </Page>
  );
}
