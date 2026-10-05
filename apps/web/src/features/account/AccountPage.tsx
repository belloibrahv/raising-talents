import { useMutation } from '@tanstack/react-query';
import { Download, TriangleAlert } from 'lucide-react';
import { useRef, useState, type SubmitEvent } from 'react';
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

const memberSince = new Intl.DateTimeFormat('en-NG', { month: 'long', year: 'numeric' });

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
    <Page title={t('account.title')} documentTitle={t('titles.account')} titleClassName="sr-only">
      {me ? (
        <section
          className="flex items-center gap-4 rounded-3xl bg-stage p-6 text-stage-foreground [background-image:radial-gradient(ellipse_60%_120%_at_100%_0%,rgb(255_201_60/0.3),transparent_70%)]"
          aria-label={t('account.summary')}
        >
          <span
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-full bg-spotlight font-display text-2xl font-bold text-spotlight-foreground uppercase"
          >
            {me.email.slice(0, 1)}
          </span>
          <div className="grid min-w-0 gap-1">
            <p className="m-0 truncate text-lg font-bold">{me.email}</p>
            <p className="m-0 flex flex-wrap items-center gap-2 text-sm text-stage-foreground/75">
              {me.role ? (
                <span className="rounded-full bg-stage-foreground/15 px-2.5 py-0.5 font-semibold text-stage-foreground">
                  {t(`account.role.${me.role}`)}
                </span>
              ) : null}
              {t('account.memberSince', { date: memberSince.format(new Date(me.createdAt)) })}
            </p>
          </div>
        </section>
      ) : null}
      <h2 className="mt-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
        {t('account.security')}
      </h2>
      <SecuritySection />
      <h2 className="mt-2 text-xs font-bold tracking-wider text-muted-foreground uppercase">
        {t('account.privacy')}
      </h2>
      <section
        className="flex flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6"
        aria-labelledby="data-heading"
      >
        <div className="flex items-start gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-muted">
            <Download aria-hidden="true" className="size-5" />
          </span>
          <div className="grid flex-1 gap-1">
            <h3 id="data-heading">{t('account.dataTitle')}</h3>
            <p className="text-sm text-muted-foreground">{t('account.dataBody')}</p>
          </div>
        </div>
        <FormMessage tone="error">
          {download.error ? errorMessage(download.error) : null}
        </FormMessage>
        <FormMessage tone="success">
          {download.isSuccess ? t('account.downloaded') : null}
        </FormMessage>
        <div>
          <Button
            variant="secondary"
            size="sm"
            loading={download.isPending}
            onClick={() => {
              download.mutate();
            }}
          >
            {t('account.download')}
          </Button>
        </div>
      </section>
      {me?.deletionScheduledAt ? null : <DeleteAccount />}
    </Page>
  );
}

function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
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
      className="flex flex-col gap-4 rounded-2xl border border-destructive/40 bg-card p-5 text-card-foreground shadow-sm sm:p-6"
      aria-labelledby="delete-heading"
    >
      <div className="flex items-start gap-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-destructive-surface text-destructive">
          <TriangleAlert aria-hidden="true" className="size-5" />
        </span>
        <div className="grid flex-1 gap-1">
          <h3 id="delete-heading">{t('account.deleteTitle')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('account.deleteBody', { days: GRACE_DAYS })}
          </p>
        </div>
        {open ? null : (
          <Button
            ref={toggle}
            variant="secondary"
            size="sm"
            className="text-destructive"
            aria-expanded={false}
            onClick={() => {
              remove.reset();
              setOpen(true);
            }}
          >
            {t('account.deleteStart')}
          </Button>
        )}
      </div>
      {open ? (
        <form ref={form} className="stack border-t pt-4" onSubmit={submit} noValidate>
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
          <div className="row gap-2">
            <Button type="submit" variant="danger" loading={remove.isPending}>
              {t('account.delete')}
            </Button>
            <Button
              variant="text"
              onClick={() => {
                setOpen(false);
                setErrors({});
              }}
            >
              {t('account.keep')}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
