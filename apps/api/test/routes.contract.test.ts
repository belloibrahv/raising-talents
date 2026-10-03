import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import { endpoints, type EndpointDefinition } from '@rt/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, type TestApp } from './support/create-test-app.js';

interface ServedRoute {
  readonly key: string;
  readonly successStatus: number;
}

const DEFAULT_STATUS: Partial<Record<RequestMethod, number>> = { [RequestMethod.POST]: 201 };

const joinPath = (...parts: string[]) =>
  `/${parts
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')}`;

/** Reads every route NestJS registered, straight from the controller metadata. */
function servedRoutes(discovery: DiscoveryService): ServedRoute[] {
  return discovery.getControllers().flatMap((wrapper) => {
    const controller = wrapper.metatype as (new (...args: never[]) => object) | null;
    if (!controller) return [];
    const prefix = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
    const prototype = controller.prototype as Record<string, unknown>;
    return Object.getOwnPropertyNames(prototype).flatMap((name) => {
      const handler = prototype[name];
      if (typeof handler !== 'function' || name === 'constructor') return [];
      const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
      if (method === undefined) return [];
      const path = joinPath(
        prefix,
        String(Reflect.getMetadata(PATH_METADATA, handler) ?? ''),
      ).replace(/:(\w+)/g, '{$1}');
      const status =
        (Reflect.getMetadata(HTTP_CODE_METADATA, handler) as number | undefined) ??
        DEFAULT_STATUS[method] ??
        200;
      return [{ key: `${RequestMethod[method]} ${path}`, successStatus: status }];
    });
  });
}

/**
 * The endpoint catalogue in @rt/contracts is what the app calls and what the
 * OpenAPI document describes. This test fails the moment the API and the
 * catalogue disagree on a route, its method or its success status.
 */
describe('API routes match the endpoint catalogue', () => {
  let testApp: TestApp;
  let served: ServedRoute[];

  beforeAll(async () => {
    testApp = await createTestApp();
    served = servedRoutes(testApp.moduleRef.get(DiscoveryService)).filter((route) =>
      route.key.includes(' /v1/'),
    );
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  const catalogue = Object.entries(endpoints as Record<string, EndpointDefinition>).map(
    ([name, endpoint]) => ({
      name,
      key: `${endpoint.method} ${endpoint.path}`,
      successStatus: endpoint.successStatus,
    }),
  );

  it('serves every catalogued endpoint with the documented success status', () => {
    for (const entry of catalogue) {
      const route = served.find((candidate) => candidate.key === entry.key);
      expect(
        route,
        `${entry.name} (${entry.key}) is in the catalogue but no controller serves it`,
      ).toBeDefined();
      expect(
        route?.successStatus,
        `${entry.name} returns a different success status than documented`,
      ).toBe(entry.successStatus);
    }
  });

  it('serves nothing under /v1 that the catalogue does not list', () => {
    const listed = new Set(catalogue.map((entry) => entry.key));
    const unlisted = served.filter((route) => !listed.has(route.key)).map((route) => route.key);
    expect(unlisted).toEqual([]);
  });
});
