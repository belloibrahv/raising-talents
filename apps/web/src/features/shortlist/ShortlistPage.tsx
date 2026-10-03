import { SHORTLIST_NOTE_MAX, type ShortlistEntry } from '@rt/contracts';
import { Bookmark, ChevronRight, EyeOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { Button, buttonLink } from '../../shared/ui/Button';
import { EmptyState } from '../../shared/ui/EmptyState';
import { FormMessage } from '../../shared/ui/FormMessage';
import { PageSkeleton } from '../../shared/ui/PageSkeleton';
import { Page } from '../../shared/ui/Page';
import { TextArea } from '../../shared/ui/TextArea';
import { VerifiedBadge } from '../../shared/ui/VerifiedBadge';
import { useRemoveFromShortlist, useSaveToShortlist, useShortlist } from './queries';

/** The agent's saved talent, newest first, each with a private note. */
export function ShortlistPage() {
  const shortlist = useShortlist();
  const [announcement, setAnnouncement] = useState('');
  if (shortlist.isPending) return <PageSkeleton />;
  const first = shortlist.data?.pages[0];
  const items = shortlist.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <Page
      title={t('shortlist.title')}
      documentTitle={t('titles.shortlist')}
      subtitle={t('shortlist.body')}
      width="wide"
    >
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
      <FormMessage tone="error">
        {shortlist.error ? errorMessage(shortlist.error) : null}
      </FormMessage>
      {first ? (
        <p className="text-sm text-muted-foreground">
          {t('shortlist.count', { saved: first.saved, max: first.max })}
        </p>
      ) : null}
      {first && first.saved > 0 && items.length === 0 && !shortlist.hasNextPage ? (
        <EmptyState
          icon={EyeOff}
          title={t('shortlist.allHidden')}
          description={t('shortlist.allHiddenBody')}
        />
      ) : null}
      {first?.saved === 0 ? (
        <EmptyState
          icon={Bookmark}
          title={t('shortlist.empty')}
          description={t('shortlist.emptyBody')}
        >
          <Link className={buttonLink('primary', 'sm')} to="/search">
            {t('home.findTalent')}
          </Link>
        </EmptyState>
      ) : null}
      <ul className="m-0 grid list-none gap-4 p-0 lg:grid-cols-2">
        {items.map((entry) => (
          <li key={entry.talent.handle}>
            <SavedTalent entry={entry} onRemoved={setAnnouncement} />
          </li>
        ))}
      </ul>
      {shortlist.hasNextPage ? (
        <Button
          variant="secondary"
          loading={shortlist.isFetchingNextPage}
          onClick={() => void shortlist.fetchNextPage()}
        >
          {t('shortlist.loadMore')}
        </Button>
      ) : null}
    </Page>
  );
}

function SavedTalent({
  entry,
  onRemoved,
}: {
  readonly entry: ShortlistEntry;
  readonly onRemoved: (message: string) => void;
}) {
  const { talent } = entry;
  const [note, setNote] = useState(entry.note);
  const save = useSaveToShortlist();
  const remove = useRemoveFromShortlist();
  const headingId = `saved-${talent.handle}`;
  const facts = [
    [talent.category.name, ...talent.subcategories.map((entry) => entry.name)].join(', '),
    talent.city.name,
    talent.ageYears === null ? null : t('talent.age', { age: talent.ageYears }),
  ].filter(Boolean);
  return (
    <article
      className="flex h-full flex-col gap-4 rounded-2xl border bg-card p-5 text-card-foreground shadow-xs"
      aria-labelledby={headingId}
    >
      <Link
        to={`/talents/${talent.handle}`}
        className="group flex items-center gap-4 rounded-xl no-underline"
      >
        {talent.avatarUrls ? (
          <img
            className="size-16 shrink-0 rounded-full bg-muted object-cover"
            src={talent.avatarUrls.small}
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span
            className="grid size-16 shrink-0 place-items-center rounded-full bg-muted font-display text-xl font-bold text-muted-foreground"
            aria-hidden="true"
          >
            {talent.displayName.slice(0, 1)}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span id={headingId} className="flex flex-wrap items-center gap-2 text-lg font-semibold">
            {talent.displayName}
            {talent.verified ? <VerifiedBadge /> : null}
          </span>
          <span className="text-sm text-muted-foreground">{facts.join(' · ')}</span>
        </span>
        <ChevronRight
          aria-hidden="true"
          className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
        />
      </Link>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate({ handle: talent.handle, note: note.trim() });
        }}
      >
        <TextArea
          label={t('shortlist.note', { name: talent.displayName })}
          hint={t('shortlist.noteHint')}
          value={note}
          maxLength={SHORTLIST_NOTE_MAX}
          rows={2}
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
        <FormMessage tone="error">
          {save.error ? errorMessage(save.error) : remove.error ? errorMessage(remove.error) : null}
        </FormMessage>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              loading={save.isPending}
              disabled={note.trim() === entry.note}
            >
              {t('shortlist.saveNote')}
            </Button>
            {save.isSuccess && note.trim() === entry.note ? (
              <span role="status" className="text-sm text-success">
                {t('shortlist.noteSaved')}
              </span>
            ) : null}
          </div>
          <Button
            variant="quiet"
            size="sm"
            loading={remove.isPending}
            aria-label={t('shortlist.removeLabel', { name: talent.displayName })}
            onClick={() => {
              remove.mutate(talent.handle, {
                onSuccess: () => {
                  onRemoved(t('shortlist.removed', { name: talent.displayName }));
                },
              });
            }}
          >
            <Trash2 aria-hidden="true" />
            {t('shortlist.remove')}
          </Button>
        </div>
      </form>
    </article>
  );
}
