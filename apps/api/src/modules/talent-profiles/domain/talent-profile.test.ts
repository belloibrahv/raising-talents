import { describe, expect, it } from 'vitest';
import { handleFromName, isReservedHandle } from './handle.js';
import { TalentProfile } from './talent-profile.js';
import { TalentProfileEvents } from './talent-profile.events.js';

const now = new Date('2026-10-02T09:00:00.000Z');
const BIO = 'Left winger from Surulere. Fast on the break, comfortable on either foot.';
const start = () => {
  const result = TalentProfile.start({
    userId: '0192a3b4-0000-7000-8000-000000000001',
    handle: 'amaka.okafor',
    now,
  });
  if (!result.ok) throw new Error('expected success');
  return result.value;
};

describe('TalentProfile completeness', () => {
  it('lists what is missing in wizard order', () => {
    expect(start().missing()).toEqual([
      'displayName',
      'category',
      'subcategories',
      'city',
      'bio',
      'avatar',
    ]);
  });

  it('completes only with an approved avatar, and says so once', () => {
    const profile = start();
    const filled = profile.apply(
      {
        displayName: 'Amaka Okafor',
        categorySlug: 'sports',
        subcategorySlugs: ['football'],
        citySlug: 'ng-lagos',
        bio: BIO,
      },
      now,
    );
    expect(filled.ok && filled.value.becameComplete).toBe(false);
    expect(profile.missing()).toEqual(['avatar']);

    expect(
      profile.setApprovedAvatar('0192a3b4-0000-7000-8000-0000000000aa', now).becameComplete,
    ).toBe(true);
    expect(profile.isComplete).toBe(true);
    const later = profile.apply({ bio: `${BIO} Captain of my club side.` }, now);
    expect(later.ok && later.value.becameComplete).toBe(false);
    expect(
      profile.pullEvents().filter((event) => event.type === TalentProfileEvents.Completed),
    ).toHaveLength(1);
  });

  it('treats a short bio as missing', () => {
    const profile = start();
    profile.apply({ bio: 'Footballer.' }, now);
    expect(profile.missing()).toContain('bio');
  });
});

describe('TalentProfile rules', () => {
  it('clears subcategories when the category changes without new ones', () => {
    const profile = start();
    profile.apply({ categorySlug: 'sports', subcategorySlugs: ['football'] }, now);
    profile.apply({ categorySlug: 'music' }, now);
    expect(profile.snapshot().subcategorySlugs).toEqual([]);
  });

  it('refuses subcategories without a category', () => {
    const result = start().apply({ subcategorySlugs: ['football'] }, now);
    expect(!result.ok && result.error.code).toBe('VALIDATION_FAILED');
  });

  it('never leaves a cleared gender searchable', () => {
    const profile = start();
    profile.apply({ gender: 'female', genderSearchable: true }, now);
    profile.apply({ gender: null }, now);
    expect(profile.snapshot()).toMatchObject({ gender: null, genderSearchable: false });
  });

  it('removes duplicate selections and counts every change as a new version', () => {
    const profile = start();
    profile.apply(
      {
        categorySlug: 'sports',
        subcategorySlugs: ['football', 'football'],
        skillSlugs: ['sprinting', 'sprinting'],
      },
      now,
    );
    expect(profile.snapshot()).toMatchObject({
      subcategorySlugs: ['football'],
      skillSlugs: ['sprinting'],
      version: 1,
    });
  });

  it('refuses reserved handles', () => {
    const result = start().apply({ handle: 'support' }, now);
    expect(!result.ok && result.error.code).toBe('HANDLE_INVALID');
    expect(TalentProfile.start({ userId: 'x', handle: 'admin', now }).ok).toBe(false);
  });
});

describe('handles', () => {
  it('builds a readable handle from a name', () => {
    expect(handleFromName('Amaka Okafor')).toBe('amaka.okafor');
    expect(handleFromName('Chinedu  Èzè-Obi')).toBe('chinedu.eze.obi');
    expect(handleFromName('李')).toBe('talent');
    expect(isReservedHandle('RaisingTalents')).toBe(true);
  });
});
