import { PASSWORD_MIN_LENGTH } from '@rt/contracts';
import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { z } from 'zod';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { LAUNCH_COUNTRY_CODE, LEGAL_URLS } from '../../shared/config';
import { Button } from '../../shared/ui/Button';
import { Checkbox } from '../../shared/ui/Checkbox';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { PasswordField, TextField } from '../../shared/ui/TextField';
import { useFocusFirstError } from '../../shared/ui/use-focus-first-error';
import { formatDateOfBirthInput, toIsoDate } from './date-of-birth';
import { fieldErrorsFrom } from './form-errors';
import { useSignUp } from './use-auth';

type Field = 'email' | 'password' | 'dateOfBirth' | 'acceptedTerms';
type Errors = Partial<Record<Field, string>>;

const emailSchema = z.email();

export function SignUpPage() {
  const signUp = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const form = useFocusFirstError(errors);

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const normalisedEmail = email.trim().toLowerCase();
    const isoDate = toIsoDate(dateOfBirth);
    const found: Errors = {};
    if (!emailSchema.safeParse(normalisedEmail).success) found.email = t('validation.emailInvalid');
    if (password.length < PASSWORD_MIN_LENGTH) found.password = t('validation.passwordShort');
    if (!isoDate) found.dateOfBirth = t('validation.dateInvalid');
    if (!acceptedTerms) found.acceptedTerms = t('validation.termsRequired');
    setErrors(found);
    if (Object.keys(found).length > 0 || !isoDate) return;

    signUp.mutate(
      {
        email: normalisedEmail,
        password,
        dateOfBirth: isoDate,
        countryCode: LAUNCH_COUNTRY_CODE,
        acceptedTerms: true,
      },
      {
        onError: (error) => {
          const fromServer: Errors = fieldErrorsFrom(error);
          if (isApiError(error, 'UNDER_MINIMUM_AGE')) fromServer.dateOfBirth = errorMessage(error);
          if (isApiError(error, 'WEAK_PASSWORD')) fromServer.password = errorMessage(error);
          setErrors(fromServer);
        },
      },
    );
  };

  // Errors shown against a field are not repeated above the form.
  const formError =
    signUp.error &&
    !isApiError(signUp.error, 'UNDER_MINIMUM_AGE') &&
    !isApiError(signUp.error, 'WEAK_PASSWORD')
      ? errorMessage(signUp.error)
      : undefined;

  return (
    <Page title={t('signUp.title')} subtitle={t('signUp.subtitle')}>
      <form ref={form} className="stack" onSubmit={submit} noValidate>
        <FormMessage tone="error">{formError}</FormMessage>
        <TextField
          label={t('signUp.email')}
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          error={errors.email}
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
        <PasswordField
          label={t('signUp.password')}
          hint={t('signUp.passwordHint')}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          error={errors.password}
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
        />
        <TextField
          label={t('signUp.dateOfBirth')}
          hint={t('signUp.dateOfBirthHint')}
          placeholder={t('signUp.dateOfBirthPlaceholder')}
          value={dateOfBirth}
          onChange={(event) => {
            setDateOfBirth(formatDateOfBirthInput(event.target.value));
          }}
          error={errors.dateOfBirth}
          inputMode="numeric"
          autoComplete="bday"
          maxLength={10}
          required
        />
        <Checkbox
          checked={acceptedTerms}
          onChange={(event) => {
            setAcceptedTerms(event.target.checked);
          }}
          error={errors.acceptedTerms}
          label={t('signUp.terms')}
          required
        />
        <p className="links">
          <a href={LEGAL_URLS.terms} target="_blank" rel="noreferrer">
            {t('signUp.readTerms')}
          </a>
          <a href={LEGAL_URLS.guidelines} target="_blank" rel="noreferrer">
            {t('signUp.readGuidelines')}
          </a>
        </p>
        <Button type="submit" loading={signUp.isPending}>
          {t('signUp.submit')}
        </Button>
        <Link className="button button--text" to="/sign-in" replace>
          {t('signUp.haveAccount')}
        </Link>
      </form>
    </Page>
  );
}
