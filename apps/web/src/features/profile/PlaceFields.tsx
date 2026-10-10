import type { Country } from '@rt/contracts';
import { t } from '../../i18n';
import { deviceCountryCode } from '../../shared/places';
import { Combobox } from '../../shared/ui/Combobox';
import { useCountryCities } from './queries';

export interface Place {
  readonly countryCode: string;
  readonly citySlug: string;
}

/**
 * Where the pickers start: the saved city, or else the device's country when we list it,
 * so most people only choose a city.
 */
export function startingPlace(
  city: { readonly slug: string; readonly countryCode: string } | null,
  countries: readonly Country[],
): Place {
  if (city) return { countryCode: city.countryCode, citySlug: city.slug };
  const guess = deviceCountryCode();
  return {
    countryCode: guess && countries.some((country) => country.code === guess) ? guess : '',
    citySlug: '',
  };
}

interface PlaceFieldsProps {
  readonly countries: readonly Country[];
  readonly value: Place;
  readonly onChange: (place: Place) => void;
  /** Shown under the city field: the city is required on a profile, optional in a filter. */
  readonly cityError?: string | undefined;
  readonly countryError?: string | undefined;
  /** Filters offer "any"; a profile needs both. */
  readonly optional?: boolean;
  readonly className?: string;
}

/**
 * Country first, then a city in it. Changing the country clears the city, because a city
 * belongs to one country.
 */
export function PlaceFields({
  countries,
  value,
  onChange,
  cityError,
  countryError,
  optional = false,
  className,
}: PlaceFieldsProps) {
  const cities = useCountryCities(value.countryCode);
  const names = new Map<string, number>();
  for (const city of cities.data?.items ?? [])
    names.set(city.name, (names.get(city.name) ?? 0) + 1);

  return (
    <div className={className ?? 'stack'}>
      <Combobox
        label={t('place.country')}
        placeholder={optional ? t('place.anyCountry') : t('place.chooseCountry')}
        emptyText={t('place.noCountry')}
        clearLabel={optional ? t('place.anyCountry') : undefined}
        value={value.countryCode}
        onChange={(countryCode) => {
          if (countryCode !== value.countryCode) onChange({ countryCode, citySlug: '' });
        }}
        options={countries.map((country) => ({
          value: country.code,
          label: country.name,
          keywords: country.searchTerms,
        }))}
        error={countryError}
      />
      <Combobox
        label={t('place.city')}
        placeholder={
          value.countryCode === ''
            ? t('place.countryFirst')
            : optional
              ? t('place.anyCity')
              : t('place.chooseCity')
        }
        emptyText={cities.isPending ? t('common.loading') : t('place.noCity')}
        clearLabel={optional ? t('place.anyCity') : undefined}
        disabled={value.countryCode === ''}
        value={value.citySlug}
        onChange={(citySlug) => {
          onChange({ countryCode: value.countryCode, citySlug });
        }}
        options={(cities.data?.items ?? []).map((city) => ({
          value: city.slug,
          label: city.name,
          // The region tells two cities with one name apart; elsewhere it is only noise.
          detail: (names.get(city.name) ?? 0) > 1 ? (city.region ?? undefined) : undefined,
          keywords: city.region ? [city.region] : undefined,
        }))}
        hint={optional || value.countryCode === '' ? undefined : t('place.cityHint')}
        error={cityError}
      />
    </div>
  );
}
