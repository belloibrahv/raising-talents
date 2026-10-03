import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { PasswordField, TextField } from '../../shared/ui/TextField';
import { useFocusFirstError } from '../../shared/ui/use-focus-first-error';
import { useSignIn } from './use-auth';

type Errors = Partial<Record<'email' | 'password', string>>;

const emailSchema = z.email();

export function SignInPage() {
  const signIn = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const form = useFocusFirstError(errors);

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const normalisedEmail = email.trim().toLowerCase();
    const found: Errors = {};
    if (!emailSchema.safeParse(normalisedEmail).success) found.email = t('validation.emailInvalid');
    if (!password) found.password = t('validation.passwordShort');
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    signIn.mutate({ email: normalisedEmail, password });
  };

  return (
    <Page title={t('signIn.title')} documentTitle={t('titles.signIn')}>
      <form ref={form} className="stack" onSubmit={submit} noValidate>
        <FormMessage tone="error">{signIn.error ? errorMessage(signIn.error) : null}</FormMessage>
        <TextField
          label={t('signIn.email')}
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
        <PasswordField
          label={t('signIn.password')}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          error={errors.password}
          autoComplete="current-password"
          required
        />
        <Button type="submit" loading={signIn.isPending}>
          {t('signIn.submit')}
        </Button>
        <Link className="button button--text" to="/sign-up" replace>
          {t('signIn.noAccount')}
        </Link>
      </form>
    </Page>
  );
}
