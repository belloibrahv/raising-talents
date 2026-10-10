import { TaxonomyCatalog, type TaxonomySource } from '../application/taxonomy-catalog.js';

/** A small slice of the seeded lists, for tests. */
export const SAMPLE_TAXONOMY = new TaxonomyCatalog({
  categories: [
    { slug: 'sports', name: 'Sports' },
    { slug: 'music', name: 'Music' },
  ],
  subcategories: [
    { slug: 'football', name: 'Football', categorySlug: 'sports' },
    { slug: 'athletics', name: 'Athletics', categorySlug: 'sports' },
    { slug: 'singer', name: 'Singer', categorySlug: 'music' },
  ],
  skills: [
    { slug: 'sprinting', name: 'Sprinting', categorySlug: 'sports' },
    { slug: 'vocals', name: 'Vocals', categorySlug: 'music' },
    { slug: 'yoruba', name: 'Yoruba', categorySlug: null },
  ],
  countries: [
    { code: 'NG', name: 'Nigeria', searchTerms: 'Naija' },
    { code: 'GB', name: 'United Kingdom', searchTerms: 'UK, England' },
  ],
  cities: [
    { slug: 'ng-lagos', name: 'Lagos', countryCode: 'NG', region: 'Lagos' },
    { slug: 'ng-abuja', name: 'Abuja', countryCode: 'NG', region: 'FCT' },
    { slug: 'gb-london', name: 'London', countryCode: 'GB', region: 'England' },
  ],
});

export const sampleTaxonomySource: TaxonomySource = {
  current: () => Promise.resolve(SAMPLE_TAXONOMY),
};
