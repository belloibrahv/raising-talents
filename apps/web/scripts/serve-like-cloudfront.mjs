// Serves dist/ the way CloudFront does in production, for Lighthouse and browser checks:
//   node scripts/serve-like-cloudfront.mjs [port] [--stub-api]
// --stub-api also answers the start-up session check on :3000 the way the real API answers
// a visitor with no session (204), for CI runs that have no API.
// The routing function and the Content Security Policy are read from the hosting module,
// so a change there is tested here. Responses are compressed and carry the same cache
// headers the deploy uploads (hashed assets for a year, everything else no-cache).
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const terraform = readFileSync(
  fileURLToPath(new URL('../../../infra/terraform/modules/web/main.tf', import.meta.url)),
  'utf8',
);
const args = process.argv.slice(2);
const port = Number(args.find((arg) => /^\d+$/.test(arg)) ?? 4180);
const api = process.env.API_ORIGIN ?? 'http://localhost:3000';
const media = process.env.MEDIA_ORIGIN ?? 'http://localhost:4569';

// The CloudFront function that maps app routes to index.html.
const functionSource = terraform.match(/<<-JS\n([\s\S]*?)\n\s*JS/)?.[1];
if (!functionSource) throw new Error('Routing function not found in the hosting module');
const route = new Function(`${functionSource.replace(/\\\\/g, '\\')}; return handler;`)();

const policyLines = terraform.match(/content_security_policy = join\("; ", \[([\s\S]*?)\]\)/)?.[1];
if (!policyLines) throw new Error('Content Security Policy not found in the hosting module');
const csp = policyLines
  .split('\n')
  .map((line) => line.trim().replace(/^"|",?$/g, ''))
  .filter(Boolean)
  .join('; ')
  .replaceAll('${var.media_url}', media)
  .replaceAll('${var.api_url}', api)
  .replace('${join(" ", var.upload_origins)}', media)
  // Local runs are plain http.
  .replace('upgrade-insecure-requests', '');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
  '.json': 'application/json',
};
const compressible = new Set(['.html', '.js', '.css', '.svg', '.webmanifest', '.txt', '.json']);

createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const routed = route({ request: { uri: pathname } });
  const uri = routed.request?.uri ?? routed.uri ?? pathname;
  const file = join(root, uri);
  response.setHeader('content-security-policy', csp);
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    response.statusCode = 404;
    response.end('Not found');
    return;
  }
  const extension = extname(file);
  response.setHeader('content-type', types[extension] ?? 'application/octet-stream');
  response.setHeader(
    'cache-control',
    uri.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  );
  let body = readFileSync(file);
  const accepts = String(request.headers['accept-encoding'] ?? '');
  if (compressible.has(extension)) {
    response.setHeader('vary', 'accept-encoding');
    if (accepts.includes('br')) {
      body = brotliCompressSync(body);
      response.setHeader('content-encoding', 'br');
    } else if (accepts.includes('gzip')) {
      body = gzipSync(body);
      response.setHeader('content-encoding', 'gzip');
    }
  }
  response.end(body);
}).listen(port, () => {
  console.log(`Serving dist/ like CloudFront on http://localhost:${String(port)}`);
});

if (args.includes('--stub-api')) {
  const appOrigin = `http://localhost:${String(port)}`;
  createServer((request, response) => {
    response.setHeader('access-control-allow-origin', appOrigin);
    response.setHeader('access-control-allow-credentials', 'true');
    response.setHeader('access-control-allow-headers', 'content-type, authorization');
    response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    response.statusCode =
      request.method === 'OPTIONS' || path === '/v1/auth/web/refresh' ? 204 : 404;
    response.end();
  }).listen(new URL(api).port || 3000, () => {
    console.log(`Stub API for a signed-out visitor on ${api}`);
  });
}
