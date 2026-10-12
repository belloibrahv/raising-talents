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

  it('offers a skill only to the subcategories it belongs to', () => {
    const footballer = { ...valid, skillSlugs: ['goalkeeping', 'sprinting', 'yoruba'] };
    expect(SAMPLE_TAXONOMY.validateTalentSelection(footballer).ok).toBe(true);
    const hurdler = SAMPLE_TAXONOMY.validateTalentSelection({ ...valid, skillSlugs: ['hurdles'] });
    expect(!hurdler.ok && hurdler.error.message).toContain('hurdles');
    // After a change of subcategory, what no longer fits is left out.
    expect(
      SAMPLE_TAXONOMY.fittingSkills(['goalkeeping', 'sprinting', 'yoruba', 'gone'], {
        categorySlug: 'sports',
        subcategorySlugs: ['athletics'],
      }),
    ).toEqual(['sprinting', 'yoruba']);
    expect(
      SAMPLE_TAXONOMY.toResponse().skills.find((skill) => skill.slug === 'goalkeeping'),
    ).toEqual({
      slug: 'goalkeeping',
      name: 'Goalkeeping',
      categorySlug: 'sports',
      subcategorySlugs: ['football'],
    });
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

  it('lists countries with the other names people type, and cities per country', () => {
    expect(SAMPLE_TAXONOMY.toResponse().countries).toContainEqual({
      code: 'GB',
      name: 'United Kingdom',
      searchTerms: ['UK', 'England'],
    });
    expect(SAMPLE_TAXONOMY.citiesIn('GB')).toEqual([
      { slug: 'gb-london', name: 'London', region: 'England' },
    ]);
    expect(SAMPLE_TAXONOMY.citiesIn('ZZ')).toBeNull();
  });
});
