import { Bookmark, BookmarkCheck } from 'lucide-react';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { Button } from '../../shared/ui/Button';
import { useRemoveFromShortlist, useSaveToShortlist, useShortlistEntry } from './queries';

/** On a talent's profile, for agents: one press saves, another removes. */
export function SaveToggle({ handle, name }: { readonly handle: string; readonly name: string }) {
  const entry = useShortlistEntry(handle, true);
  const save = useSaveToShortlist();
  const remove = useRemoveFromShortlist();
  const saved = Boolean(entry.data);
  const busy = save.isPending || remove.isPending;
  const failure = save.error ?? remove.error;
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={saved ? 'secondary' : 'primary'}
        size="sm"
        loading={busy}
        disabled={entry.isPending}
        onClick={() => {
          if (saved) remove.mutate(handle);
          else save.mutate({ handle });
        }}
      >
        {saved ? <BookmarkCheck aria-hidden="true" /> : <Bookmark aria-hidden="true" />}
        {saved ? t('shortlist.saved') : t('shortlist.save')}
        {saved ? <span className="sr-only">{t('shortlist.removeHint', { name })}</span> : null}
      </Button>
      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(failure)}
        </p>
      ) : null}
    </div>
  );
}
