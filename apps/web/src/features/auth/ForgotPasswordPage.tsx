import { useMutation } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { api } from '../../shared/api/client';
import { Button, buttonLink } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { TextField } from '../../shared/ui/TextField';
import { useFocusFirstError } from '../../shared/ui/use-focus-first-error';

const emailSchema = z.email();

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<{ email?: string }>({});
  const form = useFocusFirstError(errors);
  const request = useMutation({
    mutationFn: (address: string) =>
      api.call('auth.requestPasswordReset', { body: { email: address } }),
  });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalised = email.trim().toLowerCase();
    if (!emailSchema.safeParse(normalised).success) {
      setErrors({ email: t('validation.emailInvalid') });
      return;
    }
    setErrors({});
    request.mutate(normalised, {
      onSuccess: () => void navigate(`/reset-password?email=${encodeURIComponent(normalised)}`),
    });
  };

  return (
    <Page
      title={t('forgotPassword.title')}
      documentTitle={t('titles.forgotPassword')}
      subtitle={t('forgotPassword.body')}
    >
      <form ref={form} className="stack" onSubmit={submit} noValidate>
        <FormMessage tone="error">{request.error ? errorMessage(request.error) : null}</FormMessage>
        <TextField
          label={t('forgotPassword.email')}
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          error={errors.email}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <Button type="submit" loading={request.isPending}>
          {t('forgotPassword.submit')}
        </Button>
        <Link className={buttonLink('text')} to="/sign-in" replace>
          {t('forgotPassword.back')}
        </Link>
      </form>
    </Page>
  );
}
