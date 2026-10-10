import type { TalentCard } from '@rt/contracts';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { Avatar } from '../../shared/ui/Avatar';
import { FollowButton } from './FollowButton';
import { useSuggestions, useTalentSocial } from './queries';

/** A person to follow. The button reads the follow state it changes, so it stays right. */
function Suggestion({ card }: { readonly card: TalentCard }) {
  const social = useTalentSocial(card.handle, false);
  const discipline = card.subcategories[0]?.name ?? card.category.name;
  return (
    <li className="flex w-32 shrink-0 flex-col items-center gap-2 rounded-2xl border bg-card p-3 text-center">
      <Link
        to={`/talents/${card.handle}`}
        className="flex w-full flex-col items-center gap-2 text-foreground no-underline"
        aria-label={`${card.displayName}, ${discipline}`}
      >
        <Avatar name={card.displayName} urls={card.avatarUrls} size="lg" ring />
        <span className="grid w-full">
          <span className="truncate text-sm font-semibold">{card.displayName}</span>
          <span className="truncate text-xs text-muted-foreground">{discipline}</span>
        </span>
      </Link>
      <FollowButton
        handle={card.handle}
        name={card.displayName}
        following={social.data?.followedByViewer ?? false}
      />
    </li>
  );
}

/** Talent the viewer does not follow yet, in a row that scrolls sideways. */
export function SuggestionRail() {
  const suggestions = useSuggestions();
  const items = suggestions.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="suggestions-heading" className="grid gap-3">
      <h2 id="suggestions-heading" className="px-4 text-base font-semibold sm:px-0">
        {t('social.suggested')}
      </h2>
      <ul className="m-0 flex list-none gap-3 overflow-x-auto px-4 pb-2 sm:px-0">
        {items.map((card) => (
          <Suggestion key={card.handle} card={card} />
        ))}
      </ul>
    </section>
  );
}
