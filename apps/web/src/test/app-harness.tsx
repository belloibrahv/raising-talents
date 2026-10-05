import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import axe from 'axe-core';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, vi } from 'vitest';
import { buildRoutes } from '../app/routes';
import { createQueryClient } from '../app/query-client';
import { http, session } from '../shared/api/client';

/** Shared by the screen tests: a stub API, the real router, and axe. */

export const meFor = (overrides: Record<string, unknown> = {}) => ({
  id: '0192a3b4-0000-7000-8000-000000000001',
  email: 'ngozi.adeyemi@example.com',
  emailVerified: true,
  role: 'talent',
  roleLocked: false,
  status: 'onboarding',
  countryCode: 'NG',
  deletionScheduledAt: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  ...overrides,
});

export const TAXONOMY = {
  categories: [
    {
      slug: 'music',
      name: 'Music',
      subcategories: [
        { slug: 'singer', name: 'Singer' },
        { slug: 'drummer', name: 'Drummer' },
      ],
    },
    { slug: 'sports', name: 'Sports', subcategories: [{ slug: 'football', name: 'Football' }] },
  ],
  skills: [
    { slug: 'vocals', name: 'Vocals', categorySlug: 'music' },
    { slug: 'yoruba', name: 'Yoruba', categorySlug: null },
  ],
  cities: [
    { slug: 'ng-lagos', name: 'Lagos', countryCode: 'NG' },
    { slug: 'ng-abuja', name: 'Abuja', countryCode: 'NG' },
  ],
};

export const signedIn = (me = meFor()) =>
  Response.json({ accessToken: 'access-1', accessTokenExpiresAt: '2099-01-01T00:00:00.000Z', me });

export const problem = (status: number, code: string, detail?: string) =>
  Response.json({ type: 'about:blank', title: 'Error', status, code, detail }, { status });

export interface Call {
  readonly method: string;
  readonly path: string;
  /** The query string, with its leading "?", or empty. */
  readonly query: string;
  readonly body: unknown;
  readonly headers: Record<string, string>;
}

/** Answers by "METHOD /path" or just "/path". Anything unexpected fails the test loudly. */
export type Route = (call: Call) => Response;

export function stubApi(routes: Record<string, Route>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    await Promise.resolve();
    const method = init?.method ?? 'GET';
    const path = new URL(url).pathname;
    // Screens do not depend on the event stream; tests that do stub it themselves.
    if (path === '/v1/me/events' && !routes[path] && !routes[`${method} ${path}`]) {
      return new Response(null, { status: 204 });
    }
    const call: Call = {
      method,
      path,
      query: new URL(url).search,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(call);
    const route = routes[`${method} ${path}`] ?? routes[path];
    if (!route) throw new Error(`Unexpected call to ${method} ${path}`);
    return route(call);
  });
  return calls;
}

export function renderAt(path: string) {
  const router = createMemoryRouter(buildRoutes(), { initialEntries: [path] });
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** The client and the store live for the whole app; each test starts as the app starts. */
export function resetSession(): void {
  http.forgetSession();
  session.signedOut();
  session.restoring();
}

/** axe without colour contrast, which jsdom cannot compute; contrast is checked against the tokens. */
export async function expectNoAxeViolations(): Promise<void> {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } });
  expect(result.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
}
