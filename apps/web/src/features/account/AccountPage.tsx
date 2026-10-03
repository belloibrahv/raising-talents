import { useMutation } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { api, session } from '../../shared/api/client';
import { Button } from '../../shared/ui/Button';
import { Checkbox } from '../../shared/ui/Checkbox';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { PasswordField } from '../../shared/ui/TextField';
import { useFocusFirstError } from '../../shared/ui/use-focus-first-error';
import { useSession } from '../auth/use-auth';
import { SecuritySection } from './SecuritySection';

/** Shown before deletion; the API decides the real date, from ACCOUNT_DELETION_GRACE_DAYS. */
const GRACE_DAYS = 30;

/** Saves a JSON document as a file without opening it in the browser. */
function saveJson(data: unknown, fileName: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function AccountPage() {
  const me = useSession().me;
  const download = useMutation({
    mutationFn: () => api.call('privacy.export'),
    onSuccess: (data) => {
      saveJson(data, 'raising-talents-data.json');
    },
  });
  return (
    <Page
      title={t('account.title')}
      documentTitle={t('titles.account')}
      subtitle={t('account.signedInAs', { email: me?.email ?? '' })}
    >
      <SecuritySection />
      <section
        className="flex flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
        aria-labelledby="data-heading"
      >
        <h2 id="data-heading">{t('account.dataTitle')}</h2>
        <p>{t('account.dataBody')}</p>
        <FormMessage tone="error">
          {download.error ? errorMessage(download.error) : null}
        </FormMessage>
        <FormMessage tone="success">
          {download.isSuccess ? t('account.downloaded') : null}
        </FormMessage>
        <Button
          variant="secondary"
          loading={download.isPending}
          onClick={() => {
            download.mutate();
          }}
        >
          {t('account.download')}
        </Button>
      </section>
      {me?.deletionScheduledAt ? null : <DeleteAccount />}
    </Page>
  );
}

function DeleteAccount() {
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<'password' | 'confirm', string>>>({});
  const form = useFocusFirstError(errors);
  const remove = useMutation({
    mutationFn: () => api.call('privacy.requestDeletion', { body: { password } }),
    onSuccess: (me) => {
      session.signedIn(me);
    },
  });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: typeof errors = {};
    if (!password) found.password = t('validation.passwordShort');
    if (!confirmed) found.confirm = t('account.confirmRequired');
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    remove.mutate(undefined, {
      onError: (error) => {
        // The general sign-in message mentions the email; here only the password was typed.
        if (isApiError(error, 'INVALID_CREDENTIALS'))
          setErrors({ password: t('account.wrongPassword') });
      },
    });
  };

  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
      aria-labelledby="delete-heading"
    >
      <h2 id="delete-heading">{t('account.deleteTitle')}</h2>
      <p>{t('account.deleteBody', { days: GRACE_DAYS })}</p>
      <form ref={form} className="stack" onSubmit={submit} noValidate>
        <FormMessage tone="error">
          {remove.error && !isApiError(remove.error, 'INVALID_CREDENTIALS')
            ? errorMessage(remove.error)
            : null}
        </FormMessage>
        <PasswordField
          label={t('account.password')}
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
          }}
          error={errors.password}
          autoComplete="current-password"
          required
        />
        <Checkbox
          label={t('account.confirm')}
          checked={confirmed}
          onChange={(event) => {
            setConfirmed(event.target.checked);
          }}
          error={errors.confirm}
        />
        <Button type="submit" variant="danger" loading={remove.isPending}>
          {t('account.delete')}
        </Button>
      </form>
    </section>
  );
}
