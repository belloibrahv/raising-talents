import { describe, expect, it } from 'vitest';
import { countryName, deviceCountryCode, placeLabel } from './places';

describe('places', () => {
  it('reads the country from the first language that names one', () => {
    expect(deviceCountryCode(['en', 'en-GB', 'fr-FR'])).toBe('GB');
    expect(deviceCountryCode(['en'])).toBeNull();
    expect(deviceCountryCode(['not a tag'])).toBeNull();
  });

  it('names a country in full or in short', () => {
    expect(countryName('NG')).toBe('Nigeria');
    expect(countryName('GB', 'short')).toBe('UK');
    expect(placeLabel({ name: 'London', countryCode: 'GB' })).toBe('London, UK');
  });
});
