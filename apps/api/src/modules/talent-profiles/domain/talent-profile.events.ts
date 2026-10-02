export const TalentProfileEvents = {
  /** Every change. The search index listens and adds, updates or removes the talent. */
  Updated: 'talent.TalentProfileUpdated',
  /** The first time the profile meets every completeness rule. */
  Completed: 'talent.TalentProfileCompleted',
} as const;
