// Renders the PNG icons the manifest and iOS need, and the link preview image, from
// public/favicon.svg. Run after changing the logo, then commit the files: pnpm --filter @rt/web icons
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const out = new URL('../public/icons/', import.meta.url);
await mkdir(out, { recursive: true });

const png = (source, size) => sharp(Buffer.from(source)).resize(size, size).png();
// Android and iOS cut their own corners, so those icons carry the gradient edge to edge.
const fullBleed = svg.replace('rx="112"', 'rx="0"');
const mark = svg.slice(svg.indexOf('<circle'), svg.lastIndexOf('</svg>'));

await png(svg, 192).toFile(new URL('icon-192.png', out).pathname);
await png(svg, 512).toFile(new URL('icon-512.png', out).pathname);
// Maskable icons are cropped to a circle by Android, so the mark sits inside the safe zone.
await png(
  fullBleed.replace(mark, `<g transform="translate(64 64) scale(0.75)">${mark}</g>`),
  512,
).toFile(new URL('icon-maskable-512.png', out).pathname);
await png(fullBleed, 180).toFile(
  new URL('../public/apple-touch-icon.png', import.meta.url).pathname,
);

// The picture beside a shared link (ADR-043): 1200 by 630, the mark and the name on the stage.
const preview = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="pink" cx="92%" cy="0%" r="70%"><stop offset="0" stop-color="#DB2777" stop-opacity=".55"/><stop offset="1" stop-color="#DB2777" stop-opacity="0"/></radialGradient>
    <radialGradient id="violet" cx="0%" cy="100%" r="75%"><stop offset="0" stop-color="#7C3AED" stop-opacity=".6"/><stop offset="1" stop-color="#7C3AED" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#160F2E"/>
  <rect width="1200" height="630" fill="url(#pink)"/>
  <rect width="1200" height="630" fill="url(#violet)"/>
  <g transform="translate(96 96) scale(0.25)">${svg.slice(svg.indexOf('<defs>'), svg.lastIndexOf('</svg>'))}</g>
  <text x="252" y="180" font-family="Helvetica Neue, Arial, sans-serif" font-size="46" font-weight="700" fill="#FFFFFF">Raising Talents</text>
  <text x="96" y="372" font-family="Helvetica Neue, Arial, sans-serif" font-size="84" font-weight="700" fill="#FFFFFF">Show your work.</text>
  <text x="96" y="472" font-family="Helvetica Neue, Arial, sans-serif" font-size="84" font-weight="700" fill="#FF9EC7">Get discovered.</text>
  <text x="96" y="548" font-family="Helvetica Neue, Arial, sans-serif" font-size="30" fill="#D9D3EA">The home for athletes, musicians, models, actors, dancers and creators.</text>
</svg>`;
await sharp(Buffer.from(preview))
  .resize(1200, 630)
  .png()
  .toFile(new URL('../public/og.png', import.meta.url).pathname);
console.log('Icons and the link preview written to public/');
