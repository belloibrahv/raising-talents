import type { MyTalentProfile } from '@rt/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
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
import { keys, refreshMe, waitUntilActive } from './queries';
import { Button, buttonLink } from '../../shared/ui/Button';
import { Progress } from '@/components/ui/progress';

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
  // Held now, or held on an earlier visit: either way the talent can carry on (ADR-044).
  const inReview = status === 'held_for_review' || (phase.kind === 'idle' && profile.photoInReview);

  return (
    <div className="stack">
      {shown ? (
        <img
          className="size-32 rounded-full bg-muted object-cover shadow-md ring-4 ring-background"
          src={shown}
          alt={preview ? t('onboarding.photo.preview') : t('onboarding.photo.current')}
        />
      ) : null}
      {phase.kind === 'uploading' ? (
        <div className="flex flex-col gap-1.5">
          <p role="status">{t('media.uploading', { percent: Math.round(phase.fraction * 100) })}</p>
          <Progress aria-hidden="true" value={phase.fraction * 100} />
        </div>
      ) : null}
      {phase.kind === 'checking' &&
      !done &&
      (status === undefined || status === 'processing' || status === 'scanning' || ready) ? (
        <p role="status">{t('onboarding.photo.checking')}</p>
      ) : null}
      {inReview ? <ContinueWhileInReview /> : null}
      <FormMessage tone="error">
        {phase.kind === 'error'
          ? phase.message
          : status === 'rejected'
            ? (media.data?.rejectionReason ?? t('errors.INTERNAL'))
            : status === 'failed'
              ? t('media.uploadFailed')
              : null}
      </FormMessage>
      {inReview ? null : done ? (
        <>
          <FormMessage tone="success">{t('onboarding.photo.done')}</FormMessage>
          <Link className={buttonLink('primary')} to="/portfolio">
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

/** The photo is with a moderator: the talent does not have to wait for them. */
function ContinueWhileInReview() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [state, setState] = useState<'idle' | 'opening' | 'slow'>('idle');
  return (
    <div className="stack gap-3 rounded-2xl border-2 border-spotlight bg-spotlight/10 p-5">
      <p className="m-0 font-semibold">{t('onboarding.photo.heldTitle')}</p>
      <p className="m-0 text-sm text-muted-foreground">{t('onboarding.photo.heldBody')}</p>
      {state === 'slow' ? (
        <FormMessage tone="error">{t('onboarding.photo.slow')}</FormMessage>
      ) : null}
      <div>
        <Button
          loading={state === 'opening'}
          onClick={() => {
            setState('opening');
            void waitUntilActive().then(async (active) => {
              if (!active) {
                setState('slow');
                return;
              }
              // Home must see the photo as waiting, not as missing.
              await queryClient.invalidateQueries({ queryKey: keys.talentProfile });
              void navigate('/home');
            });
          }}
        >
          {t('onboarding.photo.continue')}
        </Button>
      </div>
    </div>
  );
}
