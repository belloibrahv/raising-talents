import { describe, expect, it } from 'vitest';
import { searchTalentsQuerySchema } from './search.js';

describe('searchTalentsQuerySchema', () => {
  it('reads comma lists, numbers from strings, and defaults the page', () => {
    expect(
      searchTalentsQuerySchema.parse({
        q: '  afro soul ',
        cities: 'ng-lagos, ng-abuja,ng-lagos',
        ageMin: '18',
        ageMax: '25',
      }),
    ).toEqual({
      q: 'afro soul',
      subcategories: [],
      cities: ['ng-lagos', 'ng-abuja'],
      skills: [],
      ageMin: 18,
      ageMax: 25,
      page: 1,
    });
  });

  it('refuses an age range that is upside down, ages under 18, and unknown parameters', () => {
    expect(searchTalentsQuerySchema.safeParse({ ageMin: '30', ageMax: '20' }).success).toBe(false);
    expect(searchTalentsQuerySchema.safeParse({ ageMin: '16' }).success).toBe(false);
    expect(searchTalentsQuerySchema.safeParse({ city: 'ng-lagos' }).success).toBe(false);
  });

  it('refuses slugs that are not slugs and pages past the end', () => {
    expect(searchTalentsQuerySchema.safeParse({ cities: 'Lagos City' }).success).toBe(false);
    expect(searchTalentsQuerySchema.safeParse({ page: '51' }).success).toBe(false);
  });
});
