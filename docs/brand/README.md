# Brand

The look of Raising Talents across the website and the app. These files are the source; the
code follows them (ADR-062).

| File                    | What it is                                                                   |
| ----------------------- | ---------------------------------------------------------------------------- |
| `brand-style-guide.pdf` | Brand style guide v1.0: idea, voice, logo, colour, type, imagery, components |
| `ui-design.pdf`         | Screen designs: website, role choice, Discover, feed, profile, chat          |
| `logo.png`              | The mark as delivered, 388 by 388                                            |

The mark is drawn in SVG from `logo.png` in `apps/web/public/brand/` and in
`apps/web/src/shared/ui/BrandMark.tsx`, in the guide's three versions: `rt-mark` (default),
`rt-mark-spotlight` (on the stage and on dark grounds) and `rt-figure-ink` (one colour). After
changing it, run `pnpm --filter @rt/web icons` to render the app icons and the link preview.

Colours and type live as tokens in `apps/web/src/styles/app.css`, under the guide's names, with
the shadcn names pointing at them (guide section 10).
