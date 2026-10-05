import type { ImageUrls, MyTalentProfile, PublicTalentProfile } from '@rt/contracts';
import type { TaxonomyCatalog } from '../../taxonomy/application/taxonomy-catalog.js';
import type { TalentProfile } from '../domain/talent-profile.js';

/** Builds the public addresses of an approved avatar. Provided by the media module. */
export type AvatarUrls = (ownerId: string, mediaId: string) => ImageUrls;

const avatarOf = (
  props: ReturnType<TalentProfile['snapshot']>,
  urls: AvatarUrls,
): ImageUrls | null => (props.avatarMediaId ? urls(props.userId, props.avatarMediaId) : null);

export function toMyTalentProfile(
  profile: TalentProfile,
  catalog: TaxonomyCatalog,
  urls: AvatarUrls,
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
    publicLink: props.publicLink,
    shareCode: props.shareCode,
    avatarMediaId: props.avatarMediaId,
    avatarUrls: avatarOf(props, urls),
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
  urls: AvatarUrls,
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
    avatarUrls: avatarOf(props, urls),
  };
}
