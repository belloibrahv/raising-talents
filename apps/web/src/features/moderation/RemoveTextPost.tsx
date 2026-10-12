import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { api } from '../../shared/api/client';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { useSession } from '../auth/use-auth';

/**
 * Moderators only: takes down a post that is only words. There is no file to delete, so it
 * asks once and removes the post. Posts with a file use RemoveMedia. Nobody else sees it.
 */
export function RemoveTextPost({
  postId,
  owner,
}: {
  readonly postId: string;
  readonly owner: string;
}) {
  const role = useSession().me?.role;
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.call('moderation.removeTextPost', { params: { id: postId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['posts'] });
      void queryClient.invalidateQueries({ queryKey: ['social'] });
    },
  });

  if (role !== 'moderator' && role !== 'admin') return null;
  if (remove.isSuccess) {
    return (
      <p className="m-0 text-sm text-muted-foreground" role="status">
        {t('moderation.removedText')}
      </p>
    );
  }
  if (!confirming) {
    return (
      <Button
        variant="text"
        size="sm"
        className="w-fit text-destructive"
        aria-label={t('moderation.remove.postOf', { name: owner })}
        onClick={() => {
          setConfirming(true);
        }}
      >
        <ShieldAlert aria-hidden="true" className="size-4" />
        {t('moderation.remove.post')}
      </Button>
    );
  }
  return (
    <div
      className="stack gap-2 rounded-xl border bg-background p-3"
      role="group"
      aria-label={t('moderation.removeTextConfirm')}
    >
      <p className="m-0 text-sm font-medium">{t('moderation.removeTextConfirm')}</p>
      <FormMessage tone="error">{remove.error ? errorMessage(remove.error) : null}</FormMessage>
      <div className="row gap-2">
        <Button
          variant="danger"
          size="sm"
          loading={remove.isPending}
          onClick={() => {
            remove.mutate();
          }}
        >
          {t('moderation.remove.post')}
        </Button>
        <Button
          variant="text"
          size="sm"
          onClick={() => {
            setConfirming(false);
          }}
        >
          {t('report.cancel')}
        </Button>
      </div>
    </div>
  );
}
