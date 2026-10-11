import { PASSWORD_MIN_LENGTH, type SelectableRole } from '@rt/contracts';
import { useState, type SubmitEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { LEGAL_URLS } from '../../shared/config';
import { deviceCountryCode, FALLBACK_COUNTRY_CODE } from '../../shared/places';
import { Button, buttonLink } from '../../shared/ui/Button';
import { Checkbox } from '../../shared/ui/Checkbox';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { PasswordField, TextField } from '../../shared/ui/TextField';
import { useFocusFirstError } from '../../shared/ui/use-focus-first-error';
import { DateOfBirthField } from './DateOfBirthField';
import { EMPTY_DATE, toIsoDate, type DateParts } from './date-of-birth';
import { fieldErrorsFrom } from './form-errors';
import { joiningAs, roleFromLink } from './joining-as';
import { useSignUp } from './use-auth';

type Field = 'email' | 'password' | 'dateOfBirth' | 'acceptedTerms';
type Errors = Partial<Record<Field, string>>;

const emailSchema = z.email();

const ROLES: readonly SelectableRole[] = ['talent', 'agent'];

export function SignUpPage() {
  const signUp = useSignUp();
  const [search] = useSearchParams();
  const [role, setRole] = useState<SelectableRole | null>(
    () => roleFromLink(search) ?? joiningAs.get(),
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState<DateParts>(EMPTY_DATE);
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

    // Remembered for the next screen, which sets the account up as this without asking again.
    joiningAs.set(role);
    signUp.mutate(
      {
        email: normalisedEmail,
        password,
        dateOfBirth: isoDate,
        // The device's region is a starting point; the city on the profile is what people see.
        countryCode: deviceCountryCode() ?? FALLBACK_COUNTRY_CODE,
        acceptedTerms: true,
      },
      {
        onError: (error) => {
          // No account came of it, so nothing is remembered for whoever signs in next.
          joiningAs.set(null);
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
        <fieldset className="m-0 grid gap-2 border-0 p-0">
          <legend className="mb-2 p-0 text-sm font-medium">{t('signUp.joiningAs')}</legend>
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map((value) => (
              <label
                key={value}
                className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border-2 border-border bg-card px-3 text-center text-sm font-semibold transition-colors hover:border-input has-checked:border-primary has-checked:bg-accent has-checked:text-primary has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
              >
                <input
                  type="radio"
                  name="role"
                  value={value}
                  checked={role === value}
                  className="sr-only"
                  onChange={() => {
                    setRole(value);
                  }}
                />
                {t(`signUp.as.${value}`)}
              </label>
            ))}
          </div>
        </fieldset>
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
        <DateOfBirthField
          value={dateOfBirth}
          onChange={setDateOfBirth}
          hint={t('signUp.dateOfBirthHint')}
          error={errors.dateOfBirth}
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
        <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
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
        <Link className={buttonLink('text')} to="/sign-in" replace>
          {t('signUp.haveAccount')}
        </Link>
      </form>
    </Page>
  );
}
