// Renders the PNG icons the manifest and iOS need from public/favicon.svg, and the link preview
// from scripts/link-preview.html. Run after changing the logo, then commit the files:
//   pnpm --filter @rt/web icons
// The preview is a screenshot from a headless Chrome, so it is set in the brand's fonts. CHROME
// names the browser; otherwise Google Chrome, then Brave, from their usual macOS places.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const out = new URL('../public/icons/', import.meta.url);
await mkdir(out, { recursive: true });

const png = (source, size) => sharp(Buffer.from(source)).resize(size, size).png();
// Android and iOS cut their own corners, so those icons carry the stage edge to edge.
const fullBleed = svg.replace('rx="127"', 'rx="0"');
const figure = svg.slice(svg.indexOf('<circle'), svg.lastIndexOf('</svg>'));

await png(svg, 192).toFile(new URL('icon-192.png', out).pathname);
await png(svg, 512).toFile(new URL('icon-512.png', out).pathname);
// Maskable icons are cropped to a circle by Android, so the figure sits inside the safe zone.
await png(
  fullBleed.replace(figure, `<g transform="translate(64 64) scale(0.75)">${figure}</g>`),
  512,
).toFile(new URL('icon-maskable-512.png', out).pathname);
await png(fullBleed, 180).toFile(
  new URL('../public/apple-touch-icon.png', import.meta.url).pathname,
);
// A large copy of the mark for anyone who needs the logo as a picture (press, partners).
await png(svg, 1024).toFile(new URL('../public/brand/rt-mark-1024.png', import.meta.url).pathname);

const chrome = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
].find((path) => path && existsSync(path));
if (!chrome) throw new Error('No Chrome found for the link preview. Set CHROME to one.');
const preview = fileURLToPath(new URL('../public/og.png', import.meta.url));
execFileSync(chrome, [
  '--headless',
  '--disable-gpu',
  '--hide-scrollbars',
  '--allow-file-access-from-files',
  '--force-device-scale-factor=1',
  '--window-size=1200,630',
  `--screenshot=${preview}`,
  new URL('./link-preview.html', import.meta.url).href,
]);
console.log('Icons and the link preview written to public/');
