import type { MyTalentProfile, TalentMissingField } from '@rt/contracts';

export const TALENT_STEPS = ['about', 'discipline', 'location', 'story', 'photo'] as const;
export type TalentStep = (typeof TALENT_STEPS)[number];

const STEP_FOR: Record<TalentMissingField, TalentStep> = {
  displayName: 'about',
  category: 'discipline',
  subcategories: 'discipline',
  city: 'location',
  bio: 'story',
  avatar: 'photo',
};

export const isTalentStep = (value: string | undefined): value is TalentStep =>
  (TALENT_STEPS as readonly string[]).includes(value ?? '');

/** Where to resume: the first step with something missing, or null when the profile is complete. */
export function firstOpenStep(profile: MyTalentProfile | null): TalentStep | null {
  if (!profile) return 'about';
  const open = new Set(profile.missing.map((field) => STEP_FOR[field]));
  return TALENT_STEPS.find((step) => open.has(step)) ?? null;
}

export function nextStep(step: TalentStep): TalentStep | null {
  return TALENT_STEPS[TALENT_STEPS.indexOf(step) + 1] ?? null;
}

export function previousStep(step: TalentStep): TalentStep | null {
  return TALENT_STEPS[TALENT_STEPS.indexOf(step) - 1] ?? null;
}
