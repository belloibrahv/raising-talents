import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('the Railway web image', () => {
  it('copies every local module the web server imports', () => {
    // A missing one crashes the server on start (it happened once, with share-tags.mjs).
    const server = read('./serve-like-cloudfront.mjs');
    const dockerfile = read('../Dockerfile.railway');
    const imports = [...server.matchAll(/from '\.\/([\w.-]+\.mjs)'/g)].map((match) => match[1]);
    expect(imports.length).toBeGreaterThan(0);
    for (const file of imports) {
      expect(dockerfile).toContain(`/repo/apps/web/scripts/${file}`);
    }
  });
});
