import {
  SEARCH_MAX_AGE,
  SEARCH_MIN_AGE,
  type Gender,
  type TalentCard,
  type TalentSearchResponse,
} from '@rt/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState, type SubmitEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { api } from '../../shared/api/client';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { Select } from '../../shared/ui/Select';
import { TextField } from '../../shared/ui/TextField';
import { useTaxonomy } from '../profile/queries';
import { cn } from '@/lib/utils';
import {
  BadgeCheck,
  ChevronDown,
  Search as SearchIcon,
  SlidersHorizontal,
  UserSearch,
} from 'lucide-react';
import { EmptyState } from '../../shared/ui/EmptyState';

/** The filters that live in the address, so back, refresh and sharing a search all work. */
const FILTER_KEYS = ['q', 'category', 'cities', 'gender', 'ageMin', 'ageMax'] as const;
type Filters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

function filtersFrom(params: URLSearchParams): Filters {
  return Object.fromEntries(
    FILTER_KEYS.flatMap((key) => (params.get(key) ? [[key, params.get(key)]] : [])),
  );
}

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const applied = filtersFrom(params);
  const [draft, setDraft] = useState<Filters>(applied);
  const [ageProblem, setAgeProblem] = useState(false);
  const taxonomy = useTaxonomy();

  const results = useInfiniteQuery({
    queryKey: ['search', applied],
    queryFn: ({ pageParam }) =>
      api.call('search.talents', {
        query: { ...applied, gender: applied.gender as Gender | undefined, page: pageParam },
      }),
    initialPageParam: 1,
    getNextPageParam: (last: TalentSearchResponse) => (last.hasMore ? last.page + 1 : undefined),
  });

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const min = draft.ageMin ? Number(draft.ageMin) : undefined;
    const max = draft.ageMax ? Number(draft.ageMax) : undefined;
    const outOfRange = [min, max].some(
      (age) => age !== undefined && (age < SEARCH_MIN_AGE || age > SEARCH_MAX_AGE),
    );
    if (outOfRange || (min !== undefined && max !== undefined && min > max)) {
      setAgeProblem(true);
      return;
    }
    setAgeProblem(false);
    setParams(Object.fromEntries(Object.entries(draft).filter(([, value]) => value.trim())));
  };

  const first = results.data?.pages[0];
  const items = results.data?.pages.flatMap((page) => page.items) ?? [];
  const count = (facet: readonly { slug: string; count: number }[] | undefined, slug: string) =>
    facet?.find((entry) => entry.slug === slug)?.count;
  const label = (name: string, total: number | undefined) =>
    total === undefined ? name : t('search.optionCount', { name, count: total });

  return (
    <Page
      title={t('search.title')}
      documentTitle={t('titles.search')}
      subtitle={t('search.body')}
      width="wide"
    >
      <form className="stack max-w-3xl" role="search" onSubmit={submit} noValidate>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TextField
            className="flex-1"
            label={t('search.query')}
            type="search"
            enterKeyHint="search"
            placeholder={t('search.queryPlaceholder')}
            value={draft.q ?? ''}
            onChange={(event) => {
              setDraft({ ...draft, q: event.target.value });
            }}
            maxLength={100}
          />
          <Button type="submit" className="sm:h-12 sm:px-7">
            <SearchIcon aria-hidden="true" />
            {t('search.submit')}
          </Button>
        </div>
        <details
          className="group rounded-2xl border bg-card text-card-foreground shadow-sm"
          open={Object.keys(applied).some((key) => key !== 'q')}
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-5 font-semibold [&::-webkit-details-marker]:hidden">
            <SlidersHorizontal aria-hidden="true" className="size-5" />
            <span className="flex-1">{t('search.filters')}</span>
            <ChevronDown
              aria-hidden="true"
              className="size-5 text-muted-foreground transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="stack border-t px-5 py-5">
            <Select
              label={t('search.category')}
              placeholder={t('search.anyCategory')}
              value={draft.category ?? ''}
              onChange={(event) => {
                setDraft({ ...draft, category: event.target.value });
              }}
              options={(taxonomy.data?.categories ?? []).map((entry) => ({
                value: entry.slug,
                label: label(entry.name, count(first?.facets.categories, entry.slug)),
              }))}
            />
            <Select
              label={t('search.city')}
              placeholder={t('search.anyCity')}
              value={draft.cities ?? ''}
              onChange={(event) => {
                setDraft({ ...draft, cities: event.target.value });
              }}
              options={(taxonomy.data?.cities ?? []).map((entry) => ({
                value: entry.slug,
                label: label(entry.name, count(first?.facets.cities, entry.slug)),
              }))}
            />
            <div className="row items-start">
              <TextField
                label={t('search.ageMin')}
                type="number"
                inputMode="numeric"
                min={SEARCH_MIN_AGE}
                max={SEARCH_MAX_AGE}
                value={draft.ageMin ?? ''}
                onChange={(event) => {
                  setDraft({ ...draft, ageMin: event.target.value });
                }}
                error={ageProblem ? t('search.ageRange') : undefined}
                className="min-w-32 flex-1"
              />
              <TextField
                label={t('search.ageMax')}
                type="number"
                inputMode="numeric"
                min={SEARCH_MIN_AGE}
                max={SEARCH_MAX_AGE}
                value={draft.ageMax ?? ''}
                onChange={(event) => {
                  setDraft({ ...draft, ageMax: event.target.value });
                }}
                className="min-w-32 flex-1"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Select
                label={t('search.gender')}
                placeholder={t('search.anyGender')}
                value={draft.gender ?? ''}
                onChange={(event) => {
                  setDraft({ ...draft, gender: event.target.value });
                }}
                options={[
                  { value: 'female', label: t('onboarding.about.genderFemale') },
                  { value: 'male', label: t('onboarding.about.genderMale') },
                  { value: 'non_binary', label: t('onboarding.about.genderNonBinary') },
                ]}
              />
              <p className="text-sm text-muted-foreground">{t('search.genderHint')}</p>
            </div>
            <Button
              variant="text"
              onClick={() => {
                setDraft({ q: draft.q });
                setParams(draft.q ? { q: draft.q } : {});
              }}
            >
              {t('search.clear')}
            </Button>
          </div>
        </details>
      </form>
      <ul
        className="m-0 -mx-4 flex list-none gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        aria-label={t('search.quickCategories')}
      >
        {[{ slug: '', name: t('search.allTalent') }, ...(taxonomy.data?.categories ?? [])].map(
          (entry) => {
            const active = (applied.category ?? '') === entry.slug;
            return (
              <li key={entry.slug || 'all'} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={active}
                  className={cn(
                    'h-10 cursor-pointer rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors',
                    active
                      ? 'border-foreground bg-foreground text-background'
                      : 'bg-card text-foreground hover:border-input',
                  )}
                  onClick={() => {
                    const next = { ...applied, category: entry.slug };
                    setDraft(next);
                    setParams(
                      Object.fromEntries(Object.entries(next).filter(([, value]) => value.trim())),
                    );
                  }}
                >
                  {entry.name}
                </button>
              </li>
            );
          },
        )}
      </ul>

      <section
        className="stack"
        aria-label={t('search.resultsLabel')}
        aria-busy={results.isPending}
      >
        <FormMessage tone="error">{results.error ? errorMessage(results.error) : null}</FormMessage>
        <p role="status" className="text-sm text-muted-foreground">
          {first
            ? first.total === 1
              ? t('search.resultsOne')
              : t('search.results', { count: first.total })
            : null}
        </p>
        {first && first.total === 0 ? (
          <EmptyState icon={UserSearch} title={t('search.noResults')} />
        ) : null}
        <ul className="m-0 grid list-none grid-cols-2 gap-x-4 gap-y-7 p-0 md:grid-cols-3 lg:grid-cols-4">
          {items.map((card) => (
            <li key={card.handle}>
              <ResultCard card={card} />
            </li>
          ))}
        </ul>
        {results.hasNextPage ? (
          <Button
            variant="secondary"
            loading={results.isFetchingNextPage}
            onClick={() => void results.fetchNextPage()}
          >
            {t('search.loadMore')}
          </Button>
        ) : null}
      </section>
    </Page>
  );
}

function ResultCard({ card }: { readonly card: TalentCard }) {
  const facts = [
    card.city.name,
    card.ageYears === null ? null : t('talent.age', { age: card.ageYears }),
  ].filter(Boolean);
  const discipline = card.subcategories[0]?.name ?? card.category.name;
  return (
    <Link
      className="group flex flex-col gap-3 rounded-2xl no-underline"
      to={`/talents/${card.handle}`}
    >
      <span className="relative block aspect-[4/5] overflow-hidden rounded-2xl bg-muted">
        {card.avatarUrls ? (
          <img
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            src={card.avatarUrls.medium}
            srcSet={`${card.avatarUrls.small} 256w, ${card.avatarUrls.medium} 1024w`}
            sizes="(max-width: 48rem) 50vw, 18rem"
            alt=""
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span
            className="grid size-full place-items-center bg-stage font-display text-5xl font-bold text-stage-foreground/80"
            aria-hidden="true"
          >
            {card.displayName.slice(0, 1)}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
        <span className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur-sm">
          {discipline}
        </span>
      </span>
      <span className="flex flex-col gap-0.5 px-0.5">
        <span className="flex items-center gap-1.5 font-semibold text-foreground">
          <span className="truncate">{card.displayName}</span>
          {card.verified ? (
            <>
              <BadgeCheck aria-hidden="true" className="size-4 shrink-0 text-success" />
              <span className="sr-only">{`, ${t('talent.verified')}`}</span>
            </>
          ) : null}
        </span>
        <span className="truncate text-sm text-muted-foreground">{facts.join(' · ')}</span>
      </span>
    </Link>
  );
}
