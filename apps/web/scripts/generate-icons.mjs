// Renders the PNG icons the manifest and iOS need from public/favicon.svg.
// Run after changing the logo, then commit the files: pnpm --filter @rt/web icons
import { mkdir, readFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url));
const out = new URL('../public/icons/', import.meta.url);
await mkdir(out, { recursive: true });

const render = (size, file) =>
  sharp(svg).resize(size, size).png().toFile(new URL(file, out).pathname);

await render(192, 'icon-192.png');
await render(512, 'icon-512.png');
// Maskable icons are cropped to a circle by Android, so the logo sits inside the safe zone.
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#1C1A3D' } })
  .composite([{ input: await sharp(svg).resize(400, 400).png().toBuffer(), gravity: 'center' }])
  .png()
  .toFile(new URL('icon-maskable-512.png', out).pathname);
await sharp(svg)
  .resize(180, 180)
  .flatten({ background: '#1C1A3D' })
  .png()
  .toFile(new URL('../public/apple-touch-icon.png', import.meta.url).pathname);
console.log('Icons written to public/icons and public/apple-touch-icon.png');
