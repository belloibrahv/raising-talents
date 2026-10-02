import type { MyTalentProfile } from '@rt/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { api } from '../../shared/api/client';
import { FilePicker } from '../../shared/media/FilePicker';
import {
  ACCEPT_IMAGES,
  FileProblem,
  prepareForUpload,
  uploadMedia,
} from '../../shared/media/upload';
import { useMediaStatus } from '../../shared/media/use-media';
import { FormMessage } from '../../shared/ui/FormMessage';
import { keys, refreshMe } from './queries';

type Phase =
  | { kind: 'idle' }
  | { kind: 'uploading'; fraction: number }
  | { kind: 'checking'; mediaId: string }
  | { kind: 'error'; message: string };

/**
 * The last step. The photo is uploaded, scanned, and once approved the worker makes it
 * the avatar, which completes the profile. This screen follows each of those stages.
 */
export function AvatarStep({ profile }: { readonly profile: MyTalentProfile }) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [preview, setPreview] = useState<string | null>(null);
  const checkingId = phase.kind === 'checking' ? phase.mediaId : null;
  const media = useMediaStatus(checkingId);
  const ready = media.data?.status === 'ready';

  // Once approved, wait for the worker to attach it to the profile.
  const attached = useQuery({
    queryKey: [...keys.talentProfile, 'avatar', checkingId],
    queryFn: () => api.call('talentProfile.getMine'),
    enabled: ready,
    refetchInterval: (query) => (query.state.data?.avatarMediaId === checkingId ? false : 2000),
  });
  const done = attached.data?.avatarMediaId === checkingId && checkingId !== null;

  useEffect(() => {
    if (!done || !attached.data) return;
    queryClient.setQueryData(keys.talentProfile, attached.data);
    void refreshMe();
  }, [done, attached.data, queryClient]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const pick = async (file: File) => {
    try {
      const prepared = await prepareForUpload(file, { videoAllowed: false });
      setPreview(URL.createObjectURL(prepared));
      setPhase({ kind: 'uploading', fraction: 0 });
      const asset = await uploadMedia({
        purpose: 'avatar',
        file: prepared,
        onProgress: (fraction) => {
          setPhase({ kind: 'uploading', fraction });
        },
      });
      setPhase({ kind: 'checking', mediaId: asset.id });
    } catch (error) {
      setPhase({
        kind: 'error',
        message: error instanceof FileProblem ? error.message : errorMessage(error),
      });
    }
  };

  const status = media.data?.status;
  const busy =
    phase.kind === 'uploading' ||
    (phase.kind === 'checking' &&
      !done &&
      status !== 'rejected' &&
      status !== 'failed' &&
      status !== 'held_for_review');
  const shown = preview ?? profile.avatarUrls?.medium ?? null;

  return (
    <div className="stack">
      {shown ? (
        <img
          className="avatar"
          src={shown}
          alt={preview ? t('onboarding.photo.preview') : t('onboarding.photo.current')}
        />
      ) : null}
      {phase.kind === 'uploading' ? (
        <div className="stack" style={{ gap: 'var(--space-xs)' }}>
          <p role="status">{t('media.uploading', { percent: Math.round(phase.fraction * 100) })}</p>
          <div className="progress" aria-hidden="true">
            <div className="progress__bar" style={{ width: `${String(phase.fraction * 100)}%` }} />
          </div>
        </div>
      ) : null}
      {phase.kind === 'checking' &&
      !done &&
      (status === undefined || status === 'processing' || status === 'scanning' || ready) ? (
        <p role="status">{t('onboarding.photo.checking')}</p>
      ) : null}
      {status === 'held_for_review' ? (
        <FormMessage tone="success">{t('onboarding.photo.held')}</FormMessage>
      ) : null}
      <FormMessage tone="error">
        {phase.kind === 'error'
          ? phase.message
          : status === 'rejected'
            ? (media.data?.rejectionReason ?? t('errors.INTERNAL'))
            : status === 'failed'
              ? t('media.uploadFailed')
              : null}
      </FormMessage>
      {done ? (
        <>
          <FormMessage tone="success">{t('onboarding.photo.done')}</FormMessage>
          <Link className="button button--primary" to="/portfolio">
            {t('onboarding.photo.toPortfolio')}
          </Link>
        </>
      ) : (
        <FilePicker
          label={shown ? t('onboarding.photo.replace') : t('onboarding.photo.choose')}
          accept={ACCEPT_IMAGES}
          disabled={busy}
          onPick={(file) => void pick(file)}
        />
      )}
    </div>
  );
}
