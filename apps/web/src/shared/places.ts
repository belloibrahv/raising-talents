/** Used when the device gives no region, and for people already signed up at launch. */
export const FALLBACK_COUNTRY_CODE = 'NG';

/**
 * The country the device is set up for, from its language list (en-GB gives GB). A guess to
 * start the country picker on, never a fact about where someone is.
 */
export function deviceCountryCode(
  languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages,
): string | null {
  for (const language of languages) {
    try {
      const region = new Intl.Locale(language).region;
      if (region && /^[A-Z]{2}$/.test(region)) return region;
    } catch {
      // Not a language tag; try the next one.
    }
  }
  return null;
}

const regionNames = (style: 'long' | 'short') => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region', style });
  } catch {
    return null;
  }
};
const longNames = regionNames('long');
const shortNames = regionNames('short');

/** "United Kingdom" for GB. The code itself when the browser does not know it. */
export function countryName(code: string, style: 'long' | 'short' = 'long'): string {
  try {
    return (style === 'short' ? shortNames : longNames)?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** "London, UK": a city with its country, short enough for a card. */
export function placeLabel(
  city: { readonly name: string; readonly countryCode: string },
  style: 'long' | 'short' = 'short',
): string {
  return `${city.name}, ${countryName(city.countryCode, style)}`;
}
