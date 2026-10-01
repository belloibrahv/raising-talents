// Writes openapi.json from the endpoint catalogue. CI runs this and fails if the
// committed file differs, so the document can never fall behind the code.
import { writeFileSync, readFileSync } from 'node:fs';
import { buildOpenApiDocument } from '../dist/index.js';

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const document = buildOpenApiDocument(version);
writeFileSync(new URL('../openapi.json', import.meta.url), `${JSON.stringify(document, null, 2)}\n`);
process.stdout.write(`openapi.json written (${Object.keys(document.paths).length} paths)\n`);
