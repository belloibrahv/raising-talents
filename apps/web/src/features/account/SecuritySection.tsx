import { PASSWORD_MIN_LENGTH, type SignedInDevice } from '@rt/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Laptop, LogOut, Smartphone } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { api } from '../../shared/api/client';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { PasswordField } from '../../shared/ui/TextField';
import { useFocusFirstError } from '../../shared/ui/use-focus-first-error';

const devicesKey = ['security', 'devices'] as const;
const cardClass =
  'flex flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-sm sm:p-6';

/** Password and signed-in devices: what someone checks when they worry about their account. */
export function SecuritySection() {
  return (
    <>
      <ChangePasswordCard />
      <DevicesCard />
    </>
  );
}

type Errors = Partial<Record<'current' | 'next', string>>;

function ChangePasswordCard() {
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const form = useFocusFirstError(errors);
  const change = useMutation({
    mutationFn: () =>
      api.call('security.changePassword', {
        body: { currentPassword: current, newPassword: next },
      }),
    onSuccess: async () => {
      setCurrent('');
      setNext('');
      await queryClient.invalidateQueries({ queryKey: devicesKey });
    },
    onError: (error) => {
      if (isApiError(error, 'INVALID_CREDENTIALS'))
        setErrors({ current: t('security.wrongCurrent') });
      else if (isApiError(error, 'WEAK_PASSWORD')) setErrors({ next: errorMessage(error) });
    },
  });
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const found: Errors = {};
    if (!current) found.current = t('security.enterCurrent');
    if (next.length < PASSWORD_MIN_LENGTH) found.next = t('validation.passwordShort');
    setErrors(found);
    if (Object.keys(found).length === 0) change.mutate();
  };
  const fieldError =
    change.error &&
    (isApiError(change.error, 'INVALID_CREDENTIALS') || isApiError(change.error, 'WEAK_PASSWORD'));
  return (
    <section className={cardClass} aria-labelledby="password-heading">
      <h2 id="password-heading" className="flex items-center gap-2">
        <KeyRound aria-hidden="true" className="size-5" />
        {t('security.passwordTitle')}
      </h2>
      <p className="text-muted-foreground">{t('security.passwordBody')}</p>
      <form ref={form} className="stack" onSubmit={submit} noValidate>
        <FormMessage tone="success">
          {change.isSuccess ? t('security.passwordChanged') : null}
        </FormMessage>
        <FormMessage tone="error">
          {change.error && !fieldError ? errorMessage(change.error) : null}
        </FormMessage>
        <PasswordField
          label={t('security.currentPassword')}
          value={current}
          onChange={(event) => {
            setCurrent(event.target.value);
          }}
          error={errors.current}
          autoComplete="current-password"
          required
        />
        <PasswordField
          label={t('security.newPassword')}
          hint={t('signUp.passwordHint')}
          value={next}
          onChange={(event) => {
            setNext(event.target.value);
          }}
          error={errors.next}
          autoComplete="new-password"
          required
        />
        <Button type="submit" variant="secondary" loading={change.isPending}>
          {t('security.changePassword')}
        </Button>
      </form>
    </section>
  );
}

const MOBILE = /Android|iPhone|iPad/;
const when = new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' });

function DevicesCard() {
  const queryClient = useQueryClient();
  const devices = useQuery({ queryKey: devicesKey, queryFn: () => api.call('security.devices') });
  const refresh = () => queryClient.invalidateQueries({ queryKey: devicesKey });
  const signOutOthers = useMutation({
    mutationFn: () => api.call('security.signOutOthers'),
    onSuccess: refresh,
  });
  const items = devices.data?.items ?? [];
  const others = items.filter((item) => !item.current);
  return (
    <section className={cardClass} aria-labelledby="devices-heading">
      <h2 id="devices-heading">{t('security.devicesTitle')}</h2>
      <p className="text-muted-foreground">{t('security.devicesBody')}</p>
      <FormMessage tone="error">
        {devices.error
          ? errorMessage(devices.error)
          : signOutOthers.error
            ? errorMessage(signOutOthers.error)
            : null}
      </FormMessage>
      <ul className="m-0 grid list-none gap-2 p-0">
        {items.map((device) => (
          <li key={device.id}>
            <DeviceRow device={device} onSignedOut={refresh} />
          </li>
        ))}
      </ul>
      {others.length > 0 ? (
        <Button
          variant="secondary"
          loading={signOutOthers.isPending}
          onClick={() => {
            signOutOthers.mutate();
          }}
        >
          <LogOut aria-hidden="true" />
          {t('security.signOutOthers')}
        </Button>
      ) : null}
    </section>
  );
}

function DeviceRow({
  device,
  onSignedOut,
}: {
  readonly device: SignedInDevice;
  readonly onSignedOut: () => Promise<void>;
}) {
  const signOut = useMutation({
    mutationFn: () => api.call('security.signOutDevice', { params: { sessionId: device.id } }),
    onSuccess: onSignedOut,
  });
  const name = device.device ?? t('security.unknownDevice');
  const Icon = MOBILE.test(name) ? Smartphone : Laptop;
  return (
    <div className="flex items-center gap-3 rounded-xl border p-3">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="flex flex-wrap items-center gap-2 font-semibold">
          {name}
          {device.current ? <Badge variant="success">{t('security.thisDevice')}</Badge> : null}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('security.lastActive', { when: when.format(new Date(device.lastActiveAt)) })}
        </p>
      </div>
      {device.current ? null : (
        <Button
          variant="quiet"
          size="sm"
          loading={signOut.isPending}
          aria-label={t('security.signOutDevice', { name })}
          onClick={() => {
            signOut.mutate();
          }}
        >
          {t('security.signOut')}
        </Button>
      )}
    </div>
  );
}
