// Tries to slide each screen sideways at phone widths, as a thumb would, and fails if one moves.
//
//   node phone-check.mjs <path> [<path> ...]
//
//   BASE      where the app is (default http://localhost:5173)
//   EMAIL     the account to sign in as; leave out to stay signed out
//   PASSWORD  its password
//   WIDTHS    phone widths to try (default 320,375,412)
//   CHROME    the Chrome to drive (default: the macOS one)
//
// It must run as a phone (isMobile): a narrow desktop window does not widen its layout to fit
// wide content, so it hides the very fault this looks for (ADR-058). On the first width it also
// opens what can be opened (menus, filters, pickers) and tries again. Act only as a test
// account: it presses buttons that open things, never ones that save.
import puppeteer from 'puppeteer-core';

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error('usage: node phone-check.mjs <path> [<path> ...]');
  process.exit(2);
}
const base = process.env.BASE ?? 'http://localhost:5173';
const widths = (process.env.WIDTHS ?? '320,375,412').split(',').map(Number);
const settleMs = Number(process.env.SETTLE ?? 3500);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const phone = (width) => ({
  width,
  height: 800,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

const browser = await puppeteer.launch({
  executablePath:
    process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-first-run'],
});
const page = await browser.newPage();
page.on('pageerror', (error) => console.error('page error:', error.message));

if (process.env.EMAIL) {
  await page.setViewport(phone(390));
  await page.goto(`${base}/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('input[type=email]');
  await page.type('input[type=email]', process.env.EMAIL);
  await page.type('input[type=password]', process.env.PASSWORD ?? '');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !location.pathname.startsWith('/sign-in'), { timeout: 15000 });
}

/** The layout width the phone chose, how far the page slid, and what sticks out unclipped. */
const measure = (device) =>
  page.evaluate(async (device) => {
    const found = { layout: innerWidth, slid: 0, wide: [] };
    const tall = document.documentElement.scrollHeight;
    for (const y of [0, tall / 2, tall]) {
      window.scrollTo(9999, y);
      await new Promise((resolve) => setTimeout(resolve, 60));
      found.slid = Math.max(found.slid, Math.round(scrollX), Math.round(visualViewport.offsetLeft));
      window.scrollTo(0, y);
    }
    window.scrollTo(0, 0);
    // Inside a row that scrolls on purpose, or a box that hides its overflow, is fine.
    const contained = (element) => {
      for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (parent === document.body || parent === document.documentElement) return false;
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowX)) return true;
      }
      return false;
    };
    for (const element of document.querySelectorAll('body *')) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      if ((box.right > device + 1 || box.left < -1) && !contained(element)) {
        const name = String(element.className.baseVal ?? element.className).slice(0, 50);
        const text = (element.textContent ?? '').trim().slice(0, 20);
        found.wide.push(
          `${element.tagName.toLowerCase()}.${name} [${text}] ${Math.round(box.left)}..${Math.round(box.right)}`,
        );
      }
    }
    found.wide = found.wide.slice(0, 5);
    return found;
  }, device);

let failures = 0;
const report = (label, found, device, quietWhenFine = false) => {
  const bad = found.layout !== device || found.slid > 0 || found.wide.length > 0;
  if (bad) failures += 1;
  if (!bad && quietWhenFine) return;
  console.log(
    bad
      ? `FAIL ${label}  laid out ${found.layout} wide, slid ${found.slid}\n       ${found.wide.join('\n       ')}`
      : `ok   ${label}`,
  );
};

const OPENERS = 'main [aria-expanded="false"], main summary, main [aria-haspopup]';
for (const path of paths) {
  for (const width of widths) {
    await page.setViewport(phone(width));
    await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' });
    await wait(settleMs);
    report(`${path} at ${width}`, await measure(width), width);
    if (width !== widths[0]) continue;
    const openers = await page.evaluate((s) => document.querySelectorAll(s).length, OPENERS);
    for (let index = 0; index < Math.min(openers, 14); index += 1) {
      const name = await page.evaluate(
        (s, index) => {
          const element = document.querySelectorAll(s)[index];
          if (!element || element.disabled) return null;
          element.scrollIntoView({ block: 'center' });
          element.click();
          return (element.getAttribute('aria-label') ?? element.textContent ?? '')
            .trim()
            .slice(0, 30);
        },
        OPENERS,
        index,
      );
      if (name === null) continue;
      await wait(500);
      report(`${path} at ${width}, after opening "${name}"`, await measure(width), width, true);
    }
  }
}

await Promise.race([browser.close(), wait(3000)]);
console.log(failures === 0 ? 'No screen slides sideways.' : `${failures} problem(s) found.`);
process.exit(failures === 0 ? 0 : 1);
