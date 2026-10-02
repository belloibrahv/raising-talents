import type { MyTalentProfile, PublicTalentProfile } from '@rt/contracts';
import type { TaxonomyCatalog } from '../../taxonomy/application/taxonomy-catalog.js';
import type { TalentProfile } from '../domain/talent-profile.js';

export function toMyTalentProfile(
  profile: TalentProfile,
  catalog: TaxonomyCatalog,
): MyTalentProfile {
  const props = profile.snapshot();
  return {
    userId: props.userId,
    handle: props.handle,
    displayName: props.displayName,
    bio: props.bio,
    category: catalog.category(props.categorySlug),
    subcategories: catalog.subcategoryRefs(props.subcategorySlugs),
    skills: catalog.skillRefs(props.skillSlugs),
    city: catalog.city(props.citySlug),
    gender: props.gender,
    genderSearchable: props.genderSearchable,
    avatarMediaId: props.avatarMediaId,
    isComplete: profile.isComplete,
    missing: profile.missing(),
    version: props.version,
    updatedAt: props.updatedAt.toISOString(),
  };
}

/**
 * The public view. Only called for complete profiles, so required fields exist.
 * Gender appears only if the talent chose to make it visible.
 */
export function toPublicTalentProfile(
  profile: TalentProfile,
  catalog: TaxonomyCatalog,
  ageYears: number | null,
): PublicTalentProfile | null {
  const props = profile.snapshot();
  const category = catalog.category(props.categorySlug);
  const city = catalog.city(props.citySlug);
  if (!props.displayName || !category || !city) return null;
  return {
    handle: props.handle,
    displayName: props.displayName,
    bio: props.bio,
    category,
    subcategories: catalog.subcategoryRefs(props.subcategorySlugs),
    skills: catalog.skillRefs(props.skillSlugs),
    city,
    ageYears,
    gender: props.genderSearchable ? props.gender : null,
    verified: props.verifiedAt !== null,
    avatarMediaId: props.avatarMediaId,
  };
}
