import { VERIFICATION_CODE_LENGTH, type PendingEmailChange } from '@rt/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Mail, MailWarning } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { z } from 'zod';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { api, session } from '../../shared/api/client';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button, buttonLink } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { PasswordField, TextField } from '../../shared/ui/TextField';
import { useFocusFirstError } from '../../shared/ui/use-focus-first-error';
import { useSession } from '../auth/use-auth';

const pendingKey = ['security', 'email-change'] as const;
const emailSchema = z.email();
const cardClass =
  'flex flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6';

/** The account's address, and moving it: password, then a code sent to the new address. */
export function EmailCard() {
  const me = useSession().me;
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [done, setDone] = useState(false);
  const pending = useQuery({
    queryKey: pendingKey,
    // 204 when nothing is waiting, which the client returns as no body.
    queryFn: async () =>
      ((await api.call('security.pendingEmailChange')) as PendingEmailChange | undefined) ?? null,
  });
  const setPending = (value: PendingEmailChange | null) => {
    queryClient.setQueryData(pendingKey, value);
  };

  return (
    <section className={cardClass} aria-labelledby="email-heading">
      <h2 id="email-heading" className="flex items-center gap-2">
        <Mail aria-hidden="true" className="size-5" />
        {t('emailChange.title')}
      </h2>
      <FormMessage tone="success">{done ? t('emailChange.done') : null}</FormMessage>
      {pending.data ? (
        <ConfirmStep
          pending={pending.data}
          onDone={() => {
            setPending(null);
            setEditing(false);
            setDone(true);
          }}
          onCancelled={() => {
            setPending(null);
            setEditing(false);
          }}
        />
      ) : editing ? (
        <RequestStep
          onRequested={(value) => {
            setDone(false);
            setPending(value);
          }}
          onCancel={() => {
            setEditing(false);
          }}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid min-w-0 gap-1.5">
            <p className="font-semibold break-all">{me?.email}</p>
            {me?.emailVerified ? (
              <Badge variant="success">
                <BadgeCheck aria-hidden="true" />
                {t('emailChange.verified')}
              </Badge>
            ) : (
              <Badge variant="destructive">
                <MailWarning aria-hidden="true" />
                {t('emailChange.notVerified')}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {me && !me.emailVerified ? (
              <Link className={buttonLink('primary', 'sm')} to="/verify-email">
                {t('emailChange.verifyNow')}
              </Link>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setDone(false);
                setEditing(true);
              }}
            >
              {t('emailChange.change')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

type RequestErrors = Partial<Record<'email' | 'password', string>>;

function RequestStep({
  onRequested,
  onCancel,
}: {
  readonly onRequested: (pending: PendingEmailChange) => void;
  readonly onCancel: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<RequestErrors>({});
  const form = useFocusFirstError(errors);
  const request = useMutation({
    mutationFn: () =>
      api.call('security.requestEmailChange', {
        body: { newEmail: email.trim().toLowerCase(), password },
      }),
    onSuccess: onRequested,
    onError: (error) => {
      if (isApiError(error, 'INVALID_CREDENTIALS'))
        setErrors({ password: t('emailChange.wrongPassword') });
      else if (isApiError(error, 'EMAIL_ALREADY_REGISTERED') || isApiError(error, 'CONFLICT')) {
        setErrors({ email: errorMessage(error) });
      }
    },
  });
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const found: RequestErrors = {};
    if (!emailSchema.safeParse(email.trim().toLowerCase()).success) {
      found.email = t('validation.emailInvalid');
    }
    if (!password) found.password = t('emailChange.enterPassword');
    setErrors(found);
    if (Object.keys(found).length === 0) request.mutate();
  };
  const fieldError =
    request.error &&
    (['INVALID_CREDENTIALS', 'EMAIL_ALREADY_REGISTERED', 'CONFLICT'] as const).some((code) =>
      isApiError(request.error, code),
    );
  return (
    <form ref={form} className="stack" onSubmit={submit} noValidate>
      <p className="text-muted-foreground">{t('emailChange.body')}</p>
      <FormMessage tone="error">
        {request.error && !fieldError ? errorMessage(request.error) : null}
      </FormMessage>
      <TextField
        label={t('emailChange.newEmail')}
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
        label={t('emailChange.password')}
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
        error={errors.password}
        autoComplete="current-password"
        required
      />
      <div className="row">
        <Button type="submit" loading={request.isPending}>
          {t('emailChange.sendCode')}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          {t('emailChange.cancel')}
        </Button>
      </div>
    </form>
  );
}

function ConfirmStep({
  pending,
  onDone,
  onCancelled,
}: {
  readonly pending: PendingEmailChange;
  readonly onDone: () => void;
  readonly onCancelled: () => void;
}) {
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState<string | undefined>();
  const confirm = useMutation({
    mutationFn: (digits: string) =>
      api.call('security.confirmEmailChange', { body: { code: digits } }),
    onSuccess: (me) => {
      session.signedIn(me);
      onDone();
    },
    onError: (error) => {
      setProblem(errorMessage(error));
    },
  });
  const cancel = useMutation({
    mutationFn: () => api.call('security.cancelEmailChange'),
    onSuccess: onCancelled,
  });
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (code.length !== VERIFICATION_CODE_LENGTH) {
      setProblem(t('validation.codeInvalid'));
      return;
    }
    confirm.mutate(code);
  };
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <p className="text-muted-foreground">
        {t('emailChange.codeSent', { email: pending.newEmail })}
      </p>
      <TextField
        label={t('emailChange.code')}
        value={code}
        onChange={(event) => {
          const digits = event.target.value.replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH);
          setCode(digits);
          setProblem(undefined);
          if (digits.length === VERIFICATION_CODE_LENGTH) confirm.mutate(digits);
        }}
        error={problem}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={VERIFICATION_CODE_LENGTH}
        inputClassName="h-16 text-center font-mono text-3xl tracking-[0.5em] tabular-nums"
        required
      />
      <div className="row">
        <Button type="submit" loading={confirm.isPending}>
          {t('emailChange.confirm')}
        </Button>
        <Button
          variant="quiet"
          loading={cancel.isPending}
          onClick={() => {
            cancel.mutate();
          }}
        >
          {t('emailChange.keepCurrent')}
        </Button>
      </div>
    </form>
  );
}
