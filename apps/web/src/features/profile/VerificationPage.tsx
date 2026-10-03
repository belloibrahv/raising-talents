import { VERIFICATION_NOTE_MAX } from '@rt/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { isApiError } from '../../shared/api/api-error';
import { api } from '../../shared/api/client';
import { Button, buttonLink } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { TextArea } from '../../shared/ui/TextArea';
import { TextField } from '../../shared/ui/TextField';
import { useFocusFirstError } from '../../shared/ui/use-focus-first-error';
import { fieldErrorsFrom } from '../auth/form-errors';
import { verificationKey } from './verification-queries';

type Errors = Partial<Record<'evidenceUrl' | 'registrationNumber', string>>;

export function VerificationPage() {
  const queryClient = useQueryClient();
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const form = useFocusFirstError(errors);
  const request = useMutation({
    mutationFn: () =>
      api.call('agentVerification.request', {
        body: {
          evidenceUrl: evidenceUrl.trim(),
          ...(registrationNumber.trim() ? { registrationNumber: registrationNumber.trim() } : {}),
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }),
    onSuccess: (view) => queryClient.setQueryData(verificationKey, view),
  });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found: Errors = {};
    if (!/^https:\/\/\S+\.\S+/.test(evidenceUrl.trim()))
      found.evidenceUrl = t('validation.websiteInvalid');
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    request.mutate(undefined, {
      onError: (error) => {
        setErrors(fieldErrorsFrom(error));
      },
    });
  };

  return (
    <Page
      title={t('verification.title')}
      documentTitle={t('titles.verification')}
      subtitle={t('verification.body')}
    >
      {request.isSuccess ? (
        <>
          <FormMessage tone="success">{t('verification.sent')}</FormMessage>
          <Link className={buttonLink('primary')} to="/home">
            {t('nav.home')}
          </Link>
        </>
      ) : (
        <form ref={form} className="stack" onSubmit={submit} noValidate>
          <FormMessage tone="error">
            {request.error && !isApiError(request.error, 'VALIDATION_FAILED')
              ? errorMessage(request.error)
              : null}
          </FormMessage>
          <TextField
            label={t('verification.evidence')}
            hint={t('verification.evidenceHint')}
            type="url"
            inputMode="url"
            placeholder="https://"
            value={evidenceUrl}
            onChange={(event) => {
              setEvidenceUrl(event.target.value);
            }}
            error={errors.evidenceUrl}
            maxLength={300}
            required
          />
          <TextField
            label={t('verification.registration')}
            hint={t('verification.registrationHint')}
            value={registrationNumber}
            onChange={(event) => {
              setRegistrationNumber(event.target.value);
            }}
            error={errors.registrationNumber}
            autoCapitalize="characters"
            maxLength={14}
          />
          <TextArea
            label={t('verification.note')}
            value={note}
            maxLength={VERIFICATION_NOTE_MAX}
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
          <Button type="submit" loading={request.isPending}>
            {t('verification.submit')}
          </Button>
        </form>
      )}
    </Page>
  );
}
