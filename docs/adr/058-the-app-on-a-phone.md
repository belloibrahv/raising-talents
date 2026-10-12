# ADR-058: The app on a phone

- Status: Accepted
- Date: 2026-10-12
- Builds on: ADR-047 (the look), ADR-043 (shared pages)

## Context

The client reported that the app felt unresponsive and hard to use on a phone and as an
installed app. Measuring every screen at 320 to 430 pixels wide found the cause: on the
home feed, labels hidden for screen readers inside the "Suggested for you" row escaped the
row and made the page about 1,400 pixels wide. The phone then laid the page out wide and
zoomed out, the tab bar sat off-screen, and the page slid sideways. A handful of smaller
faults sat beside it: the header crowded at 320 pixels, the welcome screen cut off, the
post box wider than its card, and buttons too small for a thumb.

## Decision

- **Nothing may widen the page.** The row's items are positioned, so what is inside them
  scrolls with the row. Grids that hold a sideways row or a text box name a column that may
  shrink. `body` clips sideways overflow as a last guard.
- **The header on a phone.** Mark, name, notifications and settings. Signing out moves to
  the account screen. A screen that is not one of the tabs shows a back arrow in place of
  the mark: an installed app has no browser bar. With nothing behind it (opened from a
  link or a notification) the arrow goes up to the home screen, or to the list of chats.
- **The tab bar steps aside** while a text field has focus on a touch screen, and in a
  chat, where the message bar takes the bottom of the screen.
- **A new screen opens at its top.** Going back is left to the browser, which returns to
  where the list was. A chat opens on its newest message and follows new ones unless the
  reader has scrolled up.
- **Touch.** Controls act on the first tap (`touch-action: manipulation`), show a pressed
  state, and are at least 40 pixels in the direction that matters. Fields are never under
  16 pixels on a touch screen, or an iPhone zooms the page when one is tapped.
- **Installed on an iPhone** the status bar is the system's own (`default`), not drawn
  over the page: the header is light in the light scheme, and white status text on it could
  not be read. The browser's bar takes the header's colour in each scheme.

## Not done, on purpose

- **Pull to refresh of our own.** The browser's stays.
- **A check on real devices in CI.** The screens were measured in Chrome's phone emulation.
  iOS Safari was not available to test; the choices above follow its documented behaviour.
- **Landscape.** The installed app is portrait only.

## Consequences

- A sideways row must keep its items positioned (`relative`) if anything inside them is
  absolutely placed, visually hidden labels included.
- A bar stuck to the bottom of a phone reads `--tabs-clear` from the layout to sit above
  the tab bar, and at the edge when the tab bar is away.
- `backdrop-filter` must not go on the header: it would become the frame for the fixed tab
  bar inside it and pull the bar to the top of the screen.
