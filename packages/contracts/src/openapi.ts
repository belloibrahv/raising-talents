import { z } from 'zod';
import {
  AUTHENTICATED_ERRORS,
  COMMON_ERRORS,
  endpoints,
  type EndpointDefinition,
} from './endpoints.js';
import { ERROR_STATUS, problemDetailsSchema, type ErrorCode } from './errors.js';

type JsonObject = Record<string, unknown>;

const STATUS_DESCRIPTION: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No content',
  400: 'Invalid request',
  401: 'Not signed in',
  403: 'Not allowed',
  404: 'Not found',
  409: 'Conflict',
  412: 'Stale version',
  422: 'Request cannot be completed',
  428: 'If-Match header required',
  429: 'Too many requests',
  500: 'Something went wrong',
};

const ref = (id: string) => ({ $ref: `#/components/schemas/${id}` });

function schemaId(schema: z.ZodType): string {
  const id = z.globalRegistry.get(schema)?.id;
  if (!id)
    throw new Error(
      'Every request and response schema needs .meta({ id }) to appear in the OpenAPI document',
    );
  return id;
}

/** Generates the named schemas once from the shared registry, then keeps the ones each side needs. */
function componentSchemas(): JsonObject {
  const uri = (id: string) => `#/components/schemas/${id}`;
  const asInput = z.toJSONSchema(z.globalRegistry, {
    io: 'input',
    uri,
    target: 'draft-2020-12',
  }).schemas;
  const asOutput = z.toJSONSchema(z.globalRegistry, {
    io: 'output',
    uri,
    target: 'draft-2020-12',
  }).schemas;

  const requestIds = new Set(
    Object.values(endpoints as Record<string, EndpointDefinition>).flatMap((endpoint) =>
      endpoint.request ? [schemaId(endpoint.request)] : [],
    ),
  );
  const schemas: JsonObject = {};
  for (const [id, schema] of Object.entries(asOutput)) {
    // Requests are documented as what a client sends; responses as what it receives.
    const chosen = requestIds.has(id) ? asInput[id] : schema;
    // $schema and $id belong to standalone documents. Inside components they are noise,
    // and a fragment in $id is invalid in JSON Schema 2020-12.
    const cleaned: JsonObject = { ...(chosen as JsonObject) };
    delete cleaned.$schema;
    delete cleaned.$id;
    schemas[id] = cleaned;
  }
  return schemas;
}

function errorResponses(endpoint: EndpointDefinition): JsonObject {
  const codes = new Set<ErrorCode>([
    ...COMMON_ERRORS,
    ...(endpoint.auth ? AUTHENTICATED_ERRORS : []),
    ...endpoint.errors,
  ]);
  const byStatus = new Map<number, ErrorCode[]>();
  for (const code of codes) {
    const status = ERROR_STATUS[code];
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  return Object.fromEntries(
    [...byStatus.entries()]
      .sort(([a], [b]) => a - b)
      .map(([status, list]) => [
        String(status),
        {
          description: `${STATUS_DESCRIPTION[status] ?? 'Error'}. Codes: ${list.join(', ')}.`,
          'x-error-codes': list,
          content: { 'application/problem+json': { schema: ref(schemaId(problemDetailsSchema)) } },
        },
      ]),
  );
}

function operation(name: string, endpoint: EndpointDefinition): JsonObject {
  const pathParams: JsonObject[] = [...endpoint.path.matchAll(/\{(\w+)\}/g)].map((match) => ({
    name: match[1],
    in: 'path',
    required: true,
    schema: { type: 'string' },
  }));
  if (endpoint.concurrency === 'if-match') {
    pathParams.push({
      name: 'If-Match',
      in: 'header',
      required: false,
      description:
        'The ETag from the last read. Required once the resource exists; a stale value returns 412.',
      schema: { type: 'string' },
    });
  }
  const etagHeader = endpoint.concurrency
    ? {
        headers: {
          ETag: { description: 'Version to send back in If-Match.', schema: { type: 'string' } },
        },
      }
    : {};
  return {
    operationId: name.replace('.', '_'),
    summary: endpoint.summary,
    tags: [endpoint.tag],
    ...(endpoint.auth ? { security: [{ bearerAuth: [] }] } : { security: [] }),
    ...(pathParams.length > 0 ? { parameters: pathParams } : {}),
    ...(endpoint.request
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref(schemaId(endpoint.request)) } },
          },
        }
      : {}),
    responses: {
      [String(endpoint.successStatus)]: {
        description: STATUS_DESCRIPTION[endpoint.successStatus] ?? 'OK',
        ...etagHeader,
        ...(endpoint.response
          ? { content: { 'application/json': { schema: ref(schemaId(endpoint.response)) } } }
          : {}),
      },
      ...errorResponses(endpoint),
    },
  };
}

/** The OpenAPI 3.1 document for the whole API, built from the endpoint catalogue. */
export function buildOpenApiDocument(version: string): JsonObject {
  const paths: Record<string, JsonObject> = {};
  for (const [name, endpoint] of Object.entries(endpoints as Record<string, EndpointDefinition>)) {
    paths[endpoint.path] = {
      ...paths[endpoint.path],
      [endpoint.method.toLowerCase()]: operation(name, endpoint),
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Raising Talents API',
      version,
      description:
        'Generated from @rt/contracts. Errors use RFC 9457 problem details; choose behaviour by the `code` field, never the message.',
    },
    servers: [
      { url: 'https://api.raisingtalents.app', description: 'Production' },
      { url: 'https://api.staging.raisingtalents.app', description: 'Staging' },
      { url: 'http://localhost:3000', description: 'Local' },
    ],
    tags: [
      { name: 'Auth', description: 'Accounts, sessions and email verification' },
      { name: 'Me', description: 'The signed-in account' },
      { name: 'Taxonomy', description: 'Reference lists seeded by migrations' },
      { name: 'Talent profiles', description: 'Talent profiles and onboarding' },
      { name: 'Agent profiles', description: 'Agent profiles and onboarding' },
      {
        name: 'Media',
        description:
          'Uploads, processing and scanning. Nothing is visible before it passes the scan',
      },
      {
        name: 'Portfolio',
        description: 'Ordered images on a talent profile. Others see ready media only',
      },
    ],
    paths,
    components: {
      schemas: componentSchemas(),
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: '15-minute access token from sign-in, sign-up or refresh.',
        },
      },
    },
  };
}
