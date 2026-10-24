# ADR-062: The stage and the spotlight

- Status: Accepted
- Date: 2026-10-24
- Changes: ADR-047 (the look of the web app)

## Context

The client delivered a brand style guide (v1.0) and screen designs, in `docs/brand`. They
replace the look chosen during early development: a violet button colour, a violet to pink to
orange gradient, Figtree and Bricolage Grotesque. That look has become the default for
generated products and says nothing about this one.

## Decision

- **Tokens under the guide's names.** `apps/web/src/styles/app.css` defines spotlight, stage,
  canvas, surface, ink, line, ember, verified and danger, light and dark, as in the guide's
  table. The shadcn names the components use (`--primary`, `--background` and so on) point at
  them, as the guide's section 10 maps them, so every screen takes the new look at once and new
  code can use either name.
- **One spotlight per screen.** Marigold with ink text is the primary action. Other actions are
  an outline in the colour of the text around them, a quiet text action, or a red outline for
  destructive ones. No gradients in the interface; the one exception is a soft radial marigold
  glow behind hero media on the stage (`stage-glow`).
- **Type.** Archivo Narrow 700 for page titles and display headlines, Instrument Serif italic
  for one to three accent words (`accent-word`), Archivo 400 to 700 for everything else. Self
  hosted from `@fontsource`, so the installed app works offline.
- **Shape.** 8px inputs and tags, 16px cards, 28px hero media, pills for buttons, chips and
  avatars. Borders, not shadows; the one shadow is for things that float. A 2px focus ring with
  a 2px offset: ink on light, marigold on dark. 150ms transitions.
- **Logo.** The mark is redrawn in SVG from `logo.png` in the guide's three versions. The
  default turns into the spotlight version on the dark scheme, where its stage tile would
  vanish. Icons and the link preview are rendered from it, the preview in the brand's fonts.

## Deviations

- **Gold text is `#936500`, not `#9A6A00`.** The guide's value reads 4.25:1 on canvas, under AA;
  the darker one passes on canvas, white and spotlight-soft, and looks the same.
- **Age.** The guide and designs say "18 or older". The product minimum is 13 (ADR-059), so the
  app's copy keeps 13.

## Consequences

- Screens built to the old look keep working with the new tokens, but the screen designs (the
  website, the role choice, Discover, the feed, the profile, chat) are built to their own pages
  in later changes.
- The native app (parked, ADR-023) still has the old fonts and colours.
