// Serves dist/ the way CloudFront does in production, for Lighthouse and browser checks:
//   node scripts/serve-like-cloudfront.mjs [port] [--stub-api]
// --stub-api also answers the start-up session check on :3000 the way the real API answers
// a visitor with no session (204), for CI runs that have no API.
// It also hosts the app on Railway (ADR-036), configured by PORT, API_ORIGIN, MEDIA_ORIGIN,
// UPLOAD_ORIGIN and ERROR_REPORTING_ORIGIN. With API_UPSTREAM set, /v1 and /media are passed
// to the API over the private network, so the app and its API share one origin: the session
// cookie stays first-party on hosts whose addresses are separate sites (*.up.railway.app).
// The routing function and the Content Security Policy are read from the hosting module,
// so a change there is tested here. Responses are compressed and carry the same cache
// headers the deploy uploads (hashed assets for a year, everything else no-cache).
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer, request as forward } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const terraform = readFileSync(
  fileURLToPath(new URL('../../../infra/terraform/modules/web/main.tf', import.meta.url)),
  'utf8',
);
const args = process.argv.slice(2);
const port = Number(args.find((arg) => /^\d+$/.test(arg)) ?? process.env.PORT ?? 4180);
const api = process.env.API_ORIGIN ?? 'http://localhost:3000';
const media = process.env.MEDIA_ORIGIN ?? 'http://localhost:4569';
const uploads = process.env.UPLOAD_ORIGIN ?? media;
const secure = api.startsWith('https://');

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
  .replace('${join(" ", var.upload_origins)}', uploads)
  .replace('${var.error_reporting_origin}', process.env.ERROR_REPORTING_ORIGIN ?? '')
  // Plain-http local runs cannot upgrade requests.
  .replace('upgrade-insecure-requests', secure ? 'upgrade-insecure-requests' : '');

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

// Compressed once and kept, as the CDN keeps its compressed copies; compressing on every
// request would make the first page measured look slower than it is.
const cache = new Map();
function compressed(file, encoding) {
  const key = `${file}|${encoding ?? 'identity'}`;
  if (!cache.has(key)) {
    const raw = readFileSync(file);
    cache.set(
      key,
      encoding === 'br' ? brotliCompressSync(raw) : encoding === 'gzip' ? gzipSync(raw) : raw,
    );
  }
  return cache.get(key);
}

const upstream = process.env.API_UPSTREAM ? new URL(process.env.API_UPSTREAM) : null;

// Headers that describe one connection, not the request: never passed on (RFC 9110, 7.6.1).
const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function withoutHopByHop(headers) {
  const named = String(headers.connection ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  return Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) => !HOP_BY_HOP.has(name.toLowerCase()) && !named.includes(name.toLowerCase()),
    ),
  );
}

/** Streams the request to the API and its answer back, cookies and status included. */
function proxyToApi(request, response) {
  // The edge appends the caller's address; earlier entries could be the caller's own invention.
  const chain = String(request.headers['x-forwarded-for'] ?? '').split(',');
  const client = chain.at(-1)?.trim() || request.socket.remoteAddress || '';
  const headers = {
    ...withoutHopByHop(request.headers),
    host: upstream.host,
    'x-forwarded-for': client,
    'x-forwarded-proto': secure ? 'https' : 'http',
  };
  // Proves to the API that this server named the client; a caller's own value never passes.
  delete headers['x-proxy-secret'];
  if (process.env.PROXY_SECRET) headers['x-proxy-secret'] = process.env.PROXY_SECRET;
  const outgoing = forward(
    {
      hostname: upstream.hostname,
      port: upstream.port,
      path: request.url,
      method: request.method,
      headers,
    },
    (answer) => {
      response.writeHead(answer.statusCode ?? 502, withoutHopByHop(answer.headers));
      answer.pipe(response);
      answer.on('error', () => response.destroy());
    },
  );
  // Idle for 30 seconds: the API has stopped answering.
  outgoing.setTimeout(30_000, () => outgoing.destroy(new Error('API timed out')));
  outgoing.on('error', () => {
    // Part of an answer already went out: cut it, rather than append an error to it.
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.writeHead(502, { 'content-type': 'application/problem+json' });
    response.end(
      JSON.stringify({
        type: 'about:blank',
        title: 'API unavailable',
        status: 502,
        code: 'INTERNAL',
      }),
    );
  });
  request.pipe(outgoing);
}

createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (upstream && (pathname.startsWith('/v1/') || pathname.startsWith('/media/'))) {
    proxyToApi(request, response);
    return;
  }
  const routed = route({ request: { uri: pathname } });
  const uri = routed.request?.uri ?? routed.uri ?? pathname;
  const file = join(root, uri);
  response.setHeader('content-security-policy', csp);
  response.setHeader('x-content-type-options', 'nosniff');
  response.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  // The rest of CloudFront's response headers policy. HSTS only over https, and without
  // preload: a host's own address (such as *.up.railway.app) is not ours to preload.
  response.setHeader('x-frame-options', 'DENY');
  response.setHeader(
    'permissions-policy',
    'camera=(self), microphone=(), geolocation=(), payment=()',
  );
  if (secure)
    response.setHeader('strict-transport-security', 'max-age=63072000; includeSubDomains');
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
  const accepts = String(request.headers['accept-encoding'] ?? '');
  const encoding = !compressible.has(extension)
    ? null
    : accepts.includes('br')
      ? 'br'
      : accepts.includes('gzip')
        ? 'gzip'
        : null;
  if (compressible.has(extension)) response.setHeader('vary', 'accept-encoding');
  if (encoding) response.setHeader('content-encoding', encoding);
  response.end(compressed(file, encoding));
  // '::' also accepts IPv4: Railway's private network is IPv6, its public edge either.
}).listen(port, process.env.HOST ?? '::', () => {
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
