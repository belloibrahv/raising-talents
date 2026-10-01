/**
 * Raising Talents design tokens. A casting call, not a dashboard: ink on white,
 * with Stagelight yellow kept for the spotlight moment only.
 */
export const colors = {
  ink: '#1C1A3D',
  stagelight: '#FFC93C',
  paper: '#FFFFFF',
  haze: '#F2F1F7',
  slate: '#5E5B78',
  line: '#DDDBE8',
  danger: '#B3261E',
  dangerSurface: '#FBEDEC',
  success: '#1E7A4C',
  successSurface: '#E9F5EE',
} as const;

export const fonts = {
  display: 'BricolageGrotesque_700Bold',
  displaySemi: 'BricolageGrotesque_600SemiBold',
  body: 'Figtree_400Regular',
  bodyMedium: 'Figtree_500Medium',
  bodySemi: 'Figtree_600SemiBold',
} as const;

/** Type scale on a 1.25 ratio from a 16 point body. */
export const type = {
  display: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -1 },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  heading: { fontFamily: fonts.displaySemi, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 16, lineHeight: 24 },
  small: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Radius follows hierarchy: actions are pills, fields are soft, choices sit between. */
export const radius = { field: 12, choice: 16, pill: 999 } as const;

export const MIN_TOUCH = 48;
