import { SHORTLIST_NOTE_MAX, type ShortlistEntry } from '@rt/contracts';
import { BadgeCheck, Bookmark, BookmarkX, EyeOff, StickyNote } from 'lucide-react';
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
      <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
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
  const [editing, setEditing] = useState(false);
  const save = useSaveToShortlist();
  const remove = useRemoveFromShortlist();
  const headingId = `saved-${talent.handle}`;
  const discipline = talent.subcategories[0]?.name ?? talent.category.name;
  const facts = [
    talent.city.name,
    talent.ageYears === null ? null : t('talent.age', { age: talent.ageYears }),
  ].filter(Boolean);
  return (
    <article
      className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-2.5 text-card-foreground shadow-xs"
      aria-labelledby={headingId}
    >
      <div className="relative">
        <Link to={`/talents/${talent.handle}`} className="group block overflow-hidden rounded-xl">
          {talent.avatarUrls ? (
            <img
              className="aspect-[4/5] w-full bg-muted object-cover transition-transform duration-300 group-hover:scale-[1.04]"
              src={talent.avatarUrls.medium}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span
              className="grid aspect-[4/5] w-full place-items-center bg-stage font-display text-5xl font-bold text-stage-foreground/80"
              aria-hidden="true"
            >
              {talent.displayName.slice(0, 1)}
            </span>
          )}
          <span className="sr-only">{t('shortlist.open', { name: talent.displayName })}</span>
        </Link>
        <span className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          {discipline}
        </span>
        <button
          type="button"
          className="absolute top-2 right-2 grid size-9 cursor-pointer place-items-center rounded-full bg-white/90 text-[#1c1a3d] shadow-sm transition-colors hover:bg-white disabled:opacity-60"
          aria-label={t('shortlist.removeLabel', { name: talent.displayName })}
          disabled={remove.isPending}
          onClick={() => {
            remove.mutate(talent.handle, {
              onSuccess: () => {
                onRemoved(t('shortlist.removed', { name: talent.displayName }));
              },
            });
          }}
        >
          <BookmarkX aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="grid gap-0.5 px-1">
        <h2 id={headingId} className="flex items-center gap-1.5 text-base font-semibold">
          <span className="truncate">{talent.displayName}</span>
          {talent.verified ? (
            <>
              <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
              <span className="sr-only">{`, ${t('talent.verified')}`}</span>
            </>
          ) : null}
        </h2>
        <p className="m-0 truncate text-sm text-muted-foreground">{facts.join(' · ')}</p>
      </div>
      <FormMessage tone="error">
        {save.error ? errorMessage(save.error) : remove.error ? errorMessage(remove.error) : null}
      </FormMessage>
      {editing ? (
        <form
          className="flex flex-col gap-2 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate(
              { handle: talent.handle, note: note.trim() },
              {
                onSuccess: () => {
                  setEditing(false);
                },
              },
            );
          }}
        >
          <TextArea
            label={t('shortlist.note', { name: talent.displayName })}
            hint={t('shortlist.noteHint')}
            value={note}
            maxLength={SHORTLIST_NOTE_MAX}
            rows={3}
            autoFocus
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
          <div className="row gap-2">
            <Button
              type="submit"
              size="sm"
              loading={save.isPending}
              disabled={note.trim() === entry.note}
            >
              {t('shortlist.saveNote')}
            </Button>
            <Button
              variant="text"
              size="sm"
              onClick={() => {
                setNote(entry.note);
                save.reset();
                setEditing(false);
              }}
            >
              {t('shortlist.cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-auto px-1 pb-1">
          {entry.note ? (
            <button
              type="button"
              className="w-full cursor-pointer rounded-xl bg-spotlight/15 p-3 text-left text-sm transition-colors hover:bg-spotlight/25"
              aria-label={t('shortlist.editNote', { name: talent.displayName })}
              onClick={() => {
                save.reset();
                remove.reset();
                setEditing(true);
              }}
            >
              <span className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <StickyNote aria-hidden="true" className="size-3.5" />
                {t('shortlist.yourNote')}
              </span>
              <span className="line-clamp-3">{entry.note}</span>
            </button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              aria-label={t('shortlist.addNote', { name: talent.displayName })}
              onClick={() => {
                save.reset();
                remove.reset();
                setEditing(true);
              }}
            >
              <StickyNote aria-hidden="true" />
              {t('shortlist.addNoteShort')}
            </Button>
          )}
          {save.isSuccess ? (
            <p role="status" className="mt-2 text-xs text-success">
              {t('shortlist.noteSaved')}
            </p>
          ) : null}
        </div>
      )}
    </article>
  );
}
