import { Bookmark, Search as SearchIcon, UserSearch, X } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { Button } from '../../shared/ui/Button';
import { Checkbox } from '../../shared/ui/Checkbox';
import { EmptyState } from '../../shared/ui/EmptyState';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { TextField } from '../../shared/ui/TextField';
import { useSession } from '../auth/use-auth';
import { PlaceFields } from '../profile/PlaceFields';
import { categoryIcon } from '../profile/category-icons';
import { useTaxonomy } from '../profile/queries';
import { Chip, FilterRow } from '../search/SearchPage';
import { AgentCard } from './AgentCard';
import { ExploreTabs } from './ExploreTabs';
import { useAgents, useSavedAgents, type AgentFilters } from './queries';

const FILTER_KEYS = ['q', 'category', 'country', 'city', 'open'] as const;
type Filters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

const filtersFrom = (params: URLSearchParams): Filters =>
  Object.fromEntries(
    FILTER_KEYS.flatMap((key) => (params.get(key) ? [[key, params.get(key)]] : [])),
  );

/** Always in the same order, so one search has one address. */
const withoutEmpty = (filters: Filters) =>
  Object.fromEntries(
    FILTER_KEYS.flatMap((key) => {
      const value = filters[key]?.trim();
      return value ? [[key, value]] : [];
    }),
  );

/**
 * Verified agents and scouts, for talent looking for representation. The filters follow an
 * agent's profile: who they look for, where they are, and whether they are taking people on.
 */
export function AgentsPage() {
  const [params, setParams] = useSearchParams();
  const applied = filtersFrom(params);
  const [typed, setTyped] = useState(applied.q ?? '');
  const taxonomy = useTaxonomy();
  const isTalent = useSession().me?.role === 'talent';
  const showSaved = isTalent && params.get('view') === 'saved';

  const query: AgentFilters = {
    ...(applied.q ? { q: applied.q } : {}),
    ...(applied.category ? { category: applied.category } : {}),
    ...(applied.country ? { country: applied.country } : {}),
    ...(applied.city ? { city: applied.city } : {}),
    ...(applied.open === 'true' ? { open: 'true' as const } : {}),
  };
  const found = useAgents(query);
  const saved = useSavedAgents(showSaved);
  const results = showSaved ? saved : found;
  const items = results.data?.pages.flatMap((page) => page.items) ?? [];

  const apply = (changes: Filters) => {
    setParams(withoutEmpty({ ...applied, ...changes }));
  };
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    apply({ q: typed });
  };
  const narrowed = FILTER_KEYS.some((key) => key !== 'q' && applied[key]);
  const categories = taxonomy.data?.categories ?? [];

  return (
    <Page
      title={t('agents.title')}
      documentTitle={t('titles.agents')}
      subtitle={t('agents.body')}
      width="wide"
    >
      <ExploreTabs current="agents" />
      {isTalent ? (
        <div role="group" aria-label={t('agents.view')} className="flex gap-2">
          <Chip
            active={!showSaved}
            onClick={() => {
              setParams(withoutEmpty(applied));
            }}
          >
            {t('agents.all')}
          </Chip>
          <Chip
            active={showSaved}
            onClick={() => {
              setParams({ view: 'saved' });
            }}
          >
            <Bookmark aria-hidden="true" className="size-4" />
            {t('agents.savedTab')}
          </Chip>
        </div>
      ) : null}

      {showSaved ? null : (
        <form className="stack" role="search" onSubmit={submit} noValidate>
          <div className="flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-end">
            <TextField
              className="flex-1"
              label={t('agents.query')}
              type="search"
              enterKeyHint="search"
              placeholder={t('agents.queryPlaceholder')}
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
              }}
              maxLength={80}
            />
            <Button type="submit" className="sm:h-12 sm:px-7">
              <SearchIcon aria-hidden="true" />
              {t('agents.submit')}
            </Button>
          </div>
          <FilterRow label={t('agents.lookingForFilter')}>
            <Chip
              active={!applied.category}
              onClick={() => {
                apply({ category: '' });
              }}
            >
              {t('agents.anyCategory')}
            </Chip>
            {categories.map((entry) => {
              const Icon = categoryIcon(entry.slug);
              return (
                <Chip
                  key={entry.slug}
                  active={applied.category === entry.slug}
                  onClick={() => {
                    apply({ category: entry.slug });
                  }}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {entry.name}
                </Chip>
              );
            })}
          </FilterRow>
          <PlaceFields
            className="grid max-w-3xl gap-3 sm:grid-cols-2"
            optional
            countries={taxonomy.data?.countries ?? []}
            value={{ countryCode: applied.country ?? '', citySlug: applied.city ?? '' }}
            onChange={(place) => {
              apply({ country: place.countryCode, city: place.citySlug });
            }}
          />
          <Checkbox
            checked={applied.open === 'true'}
            onChange={(event) => {
              apply({ open: event.target.checked ? 'true' : '' });
            }}
            label={t('agents.openOnly')}
          />
        </form>
      )}

      <section
        className="stack"
        aria-label={t('agents.resultsLabel')}
        aria-busy={results.isPending}
      >
        <FormMessage tone="error">{results.error ? errorMessage(results.error) : null}</FormMessage>
        {!showSaved && narrowed ? (
          <button
            type="button"
            className="inline-flex h-10 w-fit cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-accent"
            onClick={() => {
              setParams(applied.q ? { q: applied.q } : {});
            }}
          >
            <X aria-hidden="true" className="size-4" />
            {t('search.clear')}
          </button>
        ) : null}
        {results.isSuccess && items.length === 0 ? (
          showSaved ? (
            <EmptyState
              icon={Bookmark}
              title={t('agents.noSaved')}
              description={t('agents.noSavedBody')}
            >
              <Link to="/agents">{t('agents.browse')}</Link>
            </EmptyState>
          ) : (
            <EmptyState
              icon={UserSearch}
              title={t('agents.noResults')}
              description={t('agents.noResultsBody')}
            />
          )
        ) : null}
        <ul className="m-0 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((agent) => (
            <li key={agent.id}>
              <AgentCard agent={agent} />
            </li>
          ))}
        </ul>
        {results.hasNextPage ? (
          <Button
            variant="secondary"
            loading={results.isFetchingNextPage}
            onClick={() => void results.fetchNextPage()}
          >
            {t('agents.loadMore')}
          </Button>
        ) : null}
      </section>
    </Page>
  );
}
