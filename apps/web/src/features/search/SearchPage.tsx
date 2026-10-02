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
    <Page title={t('search.title')} documentTitle={t('titles.search')} subtitle={t('search.body')}>
      <form className="stack" role="search" onSubmit={submit} noValidate>
        <TextField
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
        <details className="card" open={Object.keys(applied).some((key) => key !== 'q')}>
          <summary className="field__label">{t('search.filters')}</summary>
          <div className="stack" style={{ marginTop: 'var(--space-md)' }}>
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
            <div className="row" style={{ alignItems: 'flex-start' }}>
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
                className="field--half"
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
                className="field--half"
              />
            </div>
            <div className="stack" style={{ gap: 'var(--space-xs)' }}>
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
              <p className="field__hint">{t('search.genderHint')}</p>
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
        <Button type="submit">{t('search.submit')}</Button>
      </form>

      <section
        className="stack"
        aria-label={t('search.resultsLabel')}
        aria-busy={results.isPending}
      >
        <FormMessage tone="error">{results.error ? errorMessage(results.error) : null}</FormMessage>
        <p role="status" className="field__hint">
          {first
            ? first.total === 1
              ? t('search.resultsOne')
              : t('search.results', { count: first.total })
            : null}
        </p>
        {first && first.total === 0 ? (
          <p className="page__subtitle">{t('search.noResults')}</p>
        ) : null}
        <ul className="results">
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
    [card.category.name, ...card.subcategories.map((entry) => entry.name)].join(', '),
    card.city.name,
    card.ageYears === null ? null : t('talent.age', { age: card.ageYears }),
  ].filter(Boolean);
  return (
    <Link className="result" to={`/talents/${card.handle}`}>
      {card.avatarUrls ? (
        <img
          className="result__avatar"
          src={card.avatarUrls.small}
          alt=""
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="result__avatar" aria-hidden="true" />
      )}
      <span className="stack" style={{ gap: 2 }}>
        <span className="choice__title">
          {card.displayName}
          {card.verified ? (
            <span className="badge badge--ready">{t('talent.verified')}</span>
          ) : null}
        </span>
        <span className="field__hint">{facts.join(' · ')}</span>
      </span>
    </Link>
  );
}
