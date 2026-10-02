import { describe, expect, it } from 'vitest';
import { SAMPLE_TAXONOMY } from '../testing/sample-taxonomy.js';

const valid = {
  categorySlug: 'sports',
  subcategorySlugs: ['football'],
  skillSlugs: ['sprinting', 'yoruba'],
  citySlug: 'ng-lagos',
};

describe('TaxonomyCatalog', () => {
  it('accepts a consistent selection, including cross-category skills', () => {
    expect(SAMPLE_TAXONOMY.validateTalentSelection(valid).ok).toBe(true);
  });

  it('refuses a subcategory or skill from another category', () => {
    const wrongSub = SAMPLE_TAXONOMY.validateTalentSelection({
      ...valid,
      subcategorySlugs: ['singer'],
    });
    const wrongSkill = SAMPLE_TAXONOMY.validateTalentSelection({
      ...valid,
      skillSlugs: ['vocals'],
    });
    expect(!wrongSub.ok && wrongSub.error.code).toBe('UNKNOWN_TAXONOMY');
    expect(!wrongSkill.ok && wrongSkill.error.message).toContain('vocals');
  });

  it('refuses slugs that do not exist', () => {
    expect(SAMPLE_TAXONOMY.validateTalentSelection({ ...valid, citySlug: 'ng-atlantis' }).ok).toBe(
      false,
    );
    expect(SAMPLE_TAXONOMY.validateCategories(['sports', 'chess']).ok).toBe(false);
  });

  it('groups subcategories under their category for the app', () => {
    expect(SAMPLE_TAXONOMY.toResponse().categories[0]).toEqual({
      slug: 'sports',
      name: 'Sports',
      subcategories: [
        { slug: 'football', name: 'Football' },
        { slug: 'athletics', name: 'Athletics' },
      ],
    });
  });
});
