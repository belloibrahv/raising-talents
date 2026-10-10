import { Camera, Clapperboard, Medal, Mic, Sparkles, Star, type LucideIcon } from 'lucide-react';

const CATEGORY_ICON: Record<string, LucideIcon> = {
  sports: Medal,
  music: Mic,
  modelling: Camera,
  acting: Clapperboard,
  'content-creation': Sparkles,
};

/** The picture for a discipline; new categories get a star until they have their own. */
export const categoryIcon = (slug: string): LucideIcon => CATEGORY_ICON[slug] ?? Star;
