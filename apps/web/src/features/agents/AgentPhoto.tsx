import type { MyAgentProfile } from '@rt/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Progress } from '@/components/ui/progress';
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
import { Avatar } from '../../shared/ui/Avatar';
import { FormMessage } from '../../shared/ui/FormMessage';
import { keys } from '../profile/queries';

type Phase =
  | { kind: 'idle' }
  | { kind: 'uploading'; fraction: number }
  | { kind: 'checking'; mediaId: string }
  | { kind: 'error'; message: string };

/**
 * An agent's own photo or agency logo. Optional: it is uploaded, processed, and then the
 * worker puts it on the profile. The rest of the form is not touched while that happens.
 */
export function AgentPhoto({ profile }: { readonly profile: MyAgentProfile }) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const checkingId = phase.kind === 'checking' ? phase.mediaId : null;
  const media = useMediaStatus(checkingId);
  const status = media.data?.status;

  // Once it is live, wait for the worker to attach it to the profile.
  const attached = useQuery({
    queryKey: [...keys.agentProfile, 'avatar', checkingId],
    queryFn: () => api.call('agentProfile.getMine'),
    enabled: status === 'ready',
    refetchInterval: (query) => (query.state.data?.avatarMediaId === checkingId ? false : 2000),
  });
  const done = checkingId !== null && attached.data?.avatarMediaId === checkingId;

  useEffect(() => {
    if (done && attached.data) queryClient.setQueryData(keys.agentProfile, attached.data);
  }, [done, attached.data, queryClient]);

  const pick = async (file: File) => {
    try {
      const prepared = await prepareForUpload(file, { videoAllowed: false });
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

  const held = status === 'held_for_review';
  const stopped = status === 'rejected' || status === 'failed' || held;
  const busy = phase.kind === 'uploading' || (phase.kind === 'checking' && !done && !stopped);
  const name = profile.agencyName ?? t('agents.photo.title');
  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-4" aria-labelledby="agent-photo">
      <div className="flex items-center gap-4">
        <Avatar name={name} urls={profile.avatarUrls} size="lg" />
        <div className="grid gap-0.5">
          <h2 id="agent-photo" className="text-base font-bold">
            {t('agents.photo.title')}
          </h2>
          <p className="m-0 text-sm text-muted-foreground">{t('agents.photo.body')}</p>
        </div>
      </div>
      {phase.kind === 'uploading' ? (
        <div className="flex flex-col gap-1.5">
          <p className="m-0" role="status">
            {t('media.uploading', { percent: Math.round(phase.fraction * 100) })}
          </p>
          <Progress aria-hidden="true" value={phase.fraction * 100} />
        </div>
      ) : null}
      {phase.kind === 'checking' && !done && !stopped ? (
        <p className="m-0" role="status">
          {t('agents.photo.adding')}
        </p>
      ) : null}
      {held ? (
        <p className="m-0" role="status">
          {t('onboarding.photo.held')}
        </p>
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
      {done ? <FormMessage tone="success">{t('agents.photo.done')}</FormMessage> : null}
      <FilePicker
        label={t(profile.avatarUrls ? 'agents.photo.replace' : 'agents.photo.choose')}
        accept={ACCEPT_IMAGES}
        disabled={busy}
        onPick={(file) => void pick(file)}
      />
    </section>
  );
}
