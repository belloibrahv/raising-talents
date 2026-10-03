import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { ErrorCode } from '@rt/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, NetworkError } from '../shared/api/api-error';
import { toReport } from '../shared/observability/should-report';
import { RouteError } from './RouteError';

function renderFailing(error: unknown) {
  const Boom = () => {
    throw error;
  };
  const router = createMemoryRouter(
    [{ path: '/', element: <Boom />, errorElement: <RouteError /> }],
    { initialEntries: ['/'] },
  );
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(<RouterProvider router={router} />);
}

describe('route errors', () => {
  it('offers a reload when a new release removed the screen code', async () => {
    renderFailing(
      new TypeError('Failed to fetch dynamically imported module: /assets/Search-abc.js'),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'A new version is ready' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to the start' })).toHaveAttribute('href', '/');
  });

  it('says something went wrong for anything else, with a way to try again', async () => {
    renderFailing(new Error('Cannot read properties of undefined'));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Something went wrong' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});

describe('which errors are reported', () => {
  const problem = (status: number, code: ErrorCode) =>
    new ApiError({ type: 'about:blank', title: 'x', status, code, traceId: 'trace-1' });

  it('skips the expected: 4xx answers, lost signal and stale chunks', () => {
    expect(toReport(problem(401, 'SESSION_EXPIRED'))).toBeNull();
    expect(toReport(problem(422, 'MEDIA_TOO_LARGE'))).toBeNull();
    expect(toReport(new NetworkError(new TypeError('Failed to fetch')))).toBeNull();
    expect(toReport(new TypeError('Importing a module script failed.'))).toBeNull();
  });

  it('reports server failures with the trace id, and anything unexpected', () => {
    expect(toReport(problem(500, 'INTERNAL'))?.tags).toEqual({
      api_code: 'INTERNAL',
      api_status: '500',
      api_trace_id: 'trace-1',
    });
    expect(toReport(new Error('boom'))).not.toBeNull();
  });
});
