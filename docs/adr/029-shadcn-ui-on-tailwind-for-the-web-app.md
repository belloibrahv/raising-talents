# ADR-029: shadcn/ui on Tailwind CSS for the web app

Status: Accepted.

## Context

The PWA (ADR-023) was styled with one hand-written stylesheet of about 600 lines. It worked, but every new screen added classes, there was no dark scheme, and the client asked for a tailored interface built from well-made, familiar components. The web app also runs under a strict Content Security Policy (`style-src 'self'`, ADR-024 and the hosting module), so nothing may inject a `<style>` element at run time.

## Decision

The web app uses Tailwind CSS 4 with shadcn/ui components, copied into `apps/web/src/components/ui` and owned by us:

- The brand lives in shadcn's tokens in `src/styles/app.css`: ink as primary, Stagelight yellow as `spotlight` for the one moment that deserves it, a fixed ink `stage` for the welcome screen and profile covers, and a dark scheme that follows the phone's setting. Text meets WCAG AA and control outlines meet 3:1 in both schemes.
- Screens keep using the app's own components in `src/shared/ui` (Button, TextField, Select, TextArea, Checkbox, ChoiceGroup, FormMessage, Page, EmptyState, ActionCard), now built on the shadcn primitives. Screens never style a primitive directly when a shared component exists.
- Form controls stay native: inputs, selects, checkboxes and radios are real elements styled to match, so autofill, the phone's own pickers, labels and screen readers work as browsers intend.
- Only components that inject no styles are used. Sonner, and Radix Dialog, Sheet, Select and DropdownMenu (which add a `<style>` element for scroll locking) are not used; dialogs, when needed, are built on the native `<dialog>` element. Every release is checked in a browser under the production CSP.
- The navigation is one landmark: inline in the header on wide screens, a bottom tab bar on phones.
- Components are added with `pnpm dlx shadcn@latest add <name>` from `apps/web`, then checked for the import path (`@/lib/utils`) and formatted. Unused components are removed.

## Alternatives considered

Keeping the stylesheet: no dark scheme and slower to grow. A packaged component library (MUI, Chakra): heavier, harder to brand, and several inject styles at run time. Radix primitives for every control: their selects and dialogs need inline style elements, and native controls serve phones better.

## Consequences

Styling is in the markup as Tailwind utilities, so reviews read class lists. The CSS is generated at build time (about 9 KB gzipped). Adding a shadcn component means checking it against the CSP list above.
