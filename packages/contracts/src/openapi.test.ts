import { Validator } from '@seriousme/openapi-schema-validator';
import { describe, expect, it } from 'vitest';
import { endpoints } from './endpoints.js';
import { buildOpenApiDocument } from './openapi.js';

describe('buildOpenApiDocument', () => {
  const document = buildOpenApiDocument('0.0.0') as {
    paths: Record<
      string,
      Record<
        string,
        { responses: Record<string, { 'x-error-codes'?: string[] }>; security: unknown[] }
      >
    >;
    components: {
      schemas: Record<string, { properties?: Record<string, unknown>; required?: string[] }>;
    };
  };

  it('is a valid OpenAPI 3.1 document', async () => {
    const result = await new Validator().validate(document);
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('documents a second, bodyless success where an endpoint has one', () => {
    const refresh = document.paths['/v1/auth/web/refresh']?.['post']?.responses ?? {};
    expect(Object.keys(refresh)).toEqual(expect.arrayContaining(['200', '204']));
  });

  it('documents every endpoint in the catalogue', () => {
    for (const endpoint of Object.values(endpoints)) {
      expect(document.paths[endpoint.path]?.[endpoint.method.toLowerCase()]).toBeDefined();
    }
  });

  it('lists each business error under its HTTP status', () => {
    const signUp = document.paths['/v1/auth/sign-up']?.post;
    expect(signUp?.responses['409']?.['x-error-codes']).toContain('EMAIL_ALREADY_REGISTERED');
    expect(signUp?.responses['422']?.['x-error-codes']).toEqual([
      'UNDER_MINIMUM_AGE',
      'WEAK_PASSWORD',
    ]);
    expect(signUp?.security).toEqual([]);
    expect(document.paths['/v1/me']?.get?.security).toEqual([{ bearerAuth: [] }]);
  });

  it('documents requests as clients send them, with the email format kept', () => {
    const signUp = document.components.schemas.SignUpRequest;
    expect(signUp?.required).toContain('acceptedTerms');
    expect(signUp?.properties?.email).toMatchObject({
      type: 'string',
      format: 'email',
      maxLength: 254,
    });
  });

  it('documents query parameters as clients send them', () => {
    const search = document.paths['/v1/search/talents']?.get as unknown as {
      parameters: { name: string; in: string; schema: { type: string } }[];
    };
    const byName = Object.fromEntries(search.parameters.map((p) => [p.name, p]));
    expect(byName['cities']).toMatchObject({ in: 'query', schema: { type: 'string' } });
    expect(byName['page']?.schema.type).toBe('integer');
  });

  it('leaves no $id or $schema inside components', () => {
    const text = JSON.stringify(document.components);
    expect(text).not.toContain('"$id"');
    expect(text).not.toContain('"$schema"');
  });
});
