import {
  SEARCH_MAX_AGE,
  SEARCH_MIN_AGE,
  type Gender,
  type TalentCard,
  type TalentSearchResponse,
} from '@rt/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState, type ReactNode, type SubmitEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { t } from '../../i18n';
import { errorMessage } from '../../i18n/error-message';
import { api } from '../../shared/api/client';
import { placeLabel } from '../../shared/places';
import { Button } from '../../shared/ui/Button';
import { FormMessage } from '../../shared/ui/FormMessage';
import { Page } from '../../shared/ui/Page';
import { Select } from '../../shared/ui/Select';
import { TextField } from '../../shared/ui/TextField';
import { PlaceFields } from '../profile/PlaceFields';
import { categoryIcon } from '../profile/category-icons';
import { useTaxonomy } from '../profile/queries';
import { cn } from '@/lib/utils';
import {
  BadgeCheck,
  ChevronDown,
  Search as SearchIcon,
  SlidersHorizontal,
  UserSearch,
  X,
} from 'lucide-react';
import { EmptyState } from '../../shared/ui/EmptyState';

/** The filters that live in the address, so back, refresh and sharing a search all work. */
const FILTER_KEYS = [
  'q',
  'category',
  'subcategories',
  'country',
  'cities',
  'gender',
  'ageMin',
  'ageMax',
] as const;
type Filters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;
/** The filters typed into a form and sent together; the rest apply as soon as they are picked. */
type Typed = Pick<Filters, 'q' | 'gender' | 'ageMin' | 'ageMax'>;

function filtersFrom(params: URLSearchParams): Filters {
  return Object.fromEntries(
    FILTER_KEYS.flatMap((key) => (params.get(key) ? [[key, params.get(key)]] : [])),
  );
}

/** Always in the same order, so one search has one address. */
const withoutEmpty = (filters: Filters) =>
  Object.fromEntries(
    FILTER_KEYS.flatMap((key) => {
      const value = filters[key]?.trim();
      return value ? [[key, value]] : [];
    }),
  );

/**
 * Search follows the order of a profile: what someone does (category, then type), then
 * where they are (country, then city). Age and gender sit behind "More filters".
 */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const applied = filtersFrom(params);
  const [typed, setTyped] = useState<Typed>(applied);
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

  /** Picked filters apply at once and keep whatever is typed but not yet sent. */
  const apply = (changes: Filters) => {
    setParams(withoutEmpty({ ...applied, ...changes }));
  };

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const min = typed.ageMin ? Number(typed.ageMin) : undefined;
    const max = typed.ageMax ? Number(typed.ageMax) : undefined;
    const outOfRange = [min, max].some(
      (age) => age !== undefined && (age < SEARCH_MIN_AGE || age > SEARCH_MAX_AGE),
    );
    if (outOfRange || (min !== undefined && max !== undefined && min > max)) {
      setAgeProblem(true);
      return;
    }
    setAgeProblem(false);
    apply({
      q: typed.q ?? '',
      gender: typed.gender ?? '',
      ageMin: typed.ageMin ?? '',
      ageMax: typed.ageMax ?? '',
    });
  };

  const first = results.data?.pages[0];
  const items = results.data?.pages.flatMap((page) => page.items) ?? [];
  const count = (facet: readonly { slug: string; count: number }[] | undefined, slug: string) =>
    facet?.find((entry) => entry.slug === slug)?.count;

  const categories = taxonomy.data?.categories ?? [];
  const category = categories.find((entry) => entry.slug === applied.category);
  const chosenTypes = applied.subcategories ? applied.subcategories.split(',') : [];
  const toggleType = (slug: string) => {
    const next = chosenTypes.includes(slug)
      ? chosenTypes.filter((entry) => entry !== slug)
      : [...chosenTypes, slug].slice(-MAX_TYPES);
    apply({ subcategories: next.join(',') });
  };
  const narrowed = FILTER_KEYS.some((key) => key !== 'q' && applied[key]);

  return (
    <Page
      title={t('search.title')}
      documentTitle={t('titles.search')}
      subtitle={t('search.body')}
      width="wide"
    >
      <form className="stack" role="search" onSubmit={submit} noValidate>
        <div className="flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-end">
          <TextField
            className="flex-1"
            label={t('search.query')}
            type="search"
            enterKeyHint="search"
            placeholder={t('search.queryPlaceholder')}
            value={typed.q ?? ''}
            onChange={(event) => {
              setTyped({ ...typed, q: event.target.value });
            }}
            maxLength={100}
          />
          <Button type="submit" className="sm:h-12 sm:px-7">
            <SearchIcon aria-hidden="true" />
            {t('search.submit')}
          </Button>
        </div>

        <FilterRow label={t('search.category')}>
          <Chip
            active={!applied.category}
            onClick={() => {
              apply({ category: '', subcategories: '' });
            }}
          >
            {t('search.allTalent')}
          </Chip>
          {categories.map((entry) => {
            const Icon = categoryIcon(entry.slug);
            return (
              <Chip
                key={entry.slug}
                active={applied.category === entry.slug}
                onClick={() => {
                  // Types belong to one category, so a new category starts without any.
                  apply({ category: entry.slug, subcategories: '' });
                }}
              >
                <Icon aria-hidden="true" className="size-4" />
                {entry.name}
              </Chip>
            );
          })}
        </FilterRow>

        {category && category.subcategories.length > 0 ? (
          <FilterRow label={t('search.type')}>
            <Chip
              active={chosenTypes.length === 0}
              onClick={() => {
                apply({ subcategories: '' });
              }}
            >
              {t('search.allOf', { category: category.name.toLowerCase() })}
            </Chip>
            {category.subcategories.map((entry) => {
              const total = count(first?.facets.subcategories, entry.slug);
              return (
                <Chip
                  key={entry.slug}
                  active={chosenTypes.includes(entry.slug)}
                  onClick={() => {
                    toggleType(entry.slug);
                  }}
                >
                  {entry.name}
                  {total === undefined ? null : (
                    <span className="font-normal opacity-70">{total}</span>
                  )}
                </Chip>
              );
            })}
          </FilterRow>
        ) : null}

        <PlaceFields
          className="grid max-w-3xl gap-3 sm:grid-cols-2"
          optional
          countries={taxonomy.data?.countries ?? []}
          value={{ countryCode: applied.country ?? '', citySlug: applied.cities ?? '' }}
          onChange={(place) => {
            apply({ country: place.countryCode, cities: place.citySlug });
          }}
        />

        <details
          className="group max-w-3xl rounded-2xl border bg-card text-card-foreground shadow-sm"
          open={Boolean(applied.gender ?? applied.ageMin ?? applied.ageMax)}
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
            <div className="row items-start">
              <TextField
                label={t('search.ageMin')}
                type="number"
                inputMode="numeric"
                min={SEARCH_MIN_AGE}
                max={SEARCH_MAX_AGE}
                value={typed.ageMin ?? ''}
                onChange={(event) => {
                  setTyped({ ...typed, ageMin: event.target.value });
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
                value={typed.ageMax ?? ''}
                onChange={(event) => {
                  setTyped({ ...typed, ageMax: event.target.value });
                }}
                className="min-w-32 flex-1"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Select
                label={t('search.gender')}
                placeholder={t('search.anyGender')}
                value={typed.gender ?? ''}
                onChange={(event) => {
                  setTyped({ ...typed, gender: event.target.value });
                }}
                options={[
                  { value: 'female', label: t('onboarding.about.genderFemale') },
                  { value: 'male', label: t('onboarding.about.genderMale') },
                  { value: 'non_binary', label: t('onboarding.about.genderNonBinary') },
                ]}
              />
              <p className="text-sm text-muted-foreground">{t('search.genderHint')}</p>
            </div>
            <Button type="submit" variant="secondary">
              {t('search.apply')}
            </Button>
          </div>
        </details>
      </form>

      <section
        className="stack"
        aria-label={t('search.resultsLabel')}
        aria-busy={results.isPending}
      >
        <FormMessage tone="error">{results.error ? errorMessage(results.error) : null}</FormMessage>
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p role="status" className="text-sm text-muted-foreground">
            {first
              ? first.total === 1
                ? t('search.resultsOne')
                : t('search.results', { count: first.total })
              : null}
          </p>
          {narrowed ? (
            <button
              type="button"
              className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-accent"
              onClick={() => {
                setTyped({ q: typed.q });
                setParams(applied.q ? { q: applied.q } : {});
              }}
            >
              <X aria-hidden="true" className="size-4" />
              {t('search.clear')}
            </button>
          ) : null}
        </div>
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

/** The API takes up to five types in one search. */
const MAX_TYPES = 5;

/** One line of choices that scrolls sideways on a phone and wraps on a wide screen. */
function FilterRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="grid gap-2">
      <span className="text-sm font-semibold">{label}</span>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {children}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors',
        active
          ? 'border-foreground bg-foreground text-background'
          : 'bg-card text-foreground hover:border-input',
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ResultCard({ card }: { readonly card: TalentCard }) {
  const facts = [
    placeLabel(card.city),
    // The place takes most of the line on a phone, so the age is only the number here.
    card.ageYears === null ? null : String(card.ageYears),
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
