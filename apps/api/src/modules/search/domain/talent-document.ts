import type { PublicTalentProfile } from '@rt/contracts';

/**
 * One talent in the search index. Names are stored next to slugs so results need no
 * second lookup. The date of birth is stored as a day number for age filters only; it is
 * never returned to anyone.
 */
export interface TalentDocument {
  readonly id: string;
  readonly handle: string;
  readonly display_name: string;
  readonly bio: string;
  readonly category: string;
  readonly category_name: string;
  readonly subcategories: readonly string[];
  readonly subcategory_names: readonly string[];
  readonly skills: readonly string[];
  readonly skill_names: readonly string[];
  readonly city: string;
  readonly city_name: string;
  readonly country: string;
  /** Present only when the talent chose to be filtered by gender. */
  readonly gender?: string;
  /** Days since 1970-01-01 (UTC). */
  readonly born_on?: number;
  readonly verified: boolean;
  readonly avatar_media_id?: string;
  /** Seconds since the epoch; newest first when there is no search text. */
  readonly updated_at: number;
}

const DAY_MS = 86_400_000;

/** YYYY-MM-DD to a UTC day number. */
export function dayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Math.floor(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / DAY_MS);
}

export function toDocument(input: {
  userId: string;
  profile: PublicTalentProfile;
  updatedAt: Date;
  dateOfBirth: string | null;
}): TalentDocument {
  const { profile } = input;
  return {
    id: input.userId,
    handle: profile.handle,
    display_name: profile.displayName,
    bio: profile.bio,
    category: profile.category.slug,
    category_name: profile.category.name,
    subcategories: profile.subcategories.map((ref) => ref.slug),
    subcategory_names: profile.subcategories.map((ref) => ref.name),
    skills: profile.skills.map((ref) => ref.slug),
    skill_names: profile.skills.map((ref) => ref.name),
    city: profile.city.slug,
    city_name: profile.city.name,
    country: profile.city.countryCode,
    ...(profile.gender ? { gender: profile.gender } : {}),
    ...(input.dateOfBirth ? { born_on: dayNumber(input.dateOfBirth) } : {}),
    verified: profile.verified,
    ...(profile.avatarMediaId ? { avatar_media_id: profile.avatarMediaId } : {}),
    updated_at: Math.floor(input.updatedAt.getTime() / 1000),
  };
}

/** The same calendar day, a number of years earlier. 29 February falls back to 28 February. */
function yearsBefore(today: Date, years: number): Date {
  const date = new Date(
    Date.UTC(today.getUTCFullYear() - years, today.getUTCMonth(), today.getUTCDate()),
  );
  if (date.getUTCMonth() !== today.getUTCMonth()) date.setUTCDate(0);
  return date;
}

/**
 * An age range in years as a range of birth days. Someone is at least `min` if born on or
 * before today, `min` years ago; at most `max` if born after today, `max + 1` years ago.
 */
export function bornOnRange(
  ages: { min?: number | undefined; max?: number | undefined },
  today: Date,
): { from?: number; to?: number } {
  const toDay = (date: Date) => Math.floor(date.getTime() / DAY_MS);
  return {
    ...(ages.max === undefined ? {} : { from: toDay(yearsBefore(today, ages.max + 1)) + 1 }),
    ...(ages.min === undefined ? {} : { to: toDay(yearsBefore(today, ages.min)) }),
  };
}

/** Whole years from a birth day number, for the age shown on a result. */
export function ageFromDay(bornOn: number, today: Date): number {
  const born = new Date(bornOn * DAY_MS);
  let age = today.getUTCFullYear() - born.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < born.getUTCMonth() ||
    (today.getUTCMonth() === born.getUTCMonth() && today.getUTCDate() < born.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}
