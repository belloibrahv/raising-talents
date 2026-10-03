import { describe, expect, it } from 'vitest';
import { ApiError, NetworkError } from '../api/api-error';
import { prepareBreadcrumb, prepareEvent } from './sentry-event';

describe('events leaving for the error tracker', () => {
  it('removes bodies, cookies, headers and every query string', () => {
    const event = prepareEvent(
      {
        request: {
          url: 'https://app.test/search?q=ada+lagos#top',
          data: '{"password":"x"}',
          cookies: 'rt_refresh=abc',
          headers: { authorization: 'Bearer abc' },
          query_string: 'q=ada',
        },
        breadcrumbs: [
          { data: { url: 'https://api.test/v1/search/talents?q=ada&page=2' } },
          { data: { from: '/search?q=ada', to: '/talents/ada.sings?ref=search' } },
        ],
      },
      new Error('boom'),
    );
    expect(event).toEqual({
      request: { url: 'https://app.test/search' },
      breadcrumbs: [
        { data: { url: 'https://api.test/v1/search/talents' } },
        { data: { from: '/search', to: '/talents/ada.sings' } },
      ],
    });
  });

  it('drops what the SDK caught by itself when it is not worth reporting', () => {
    expect(prepareEvent({}, new NetworkError(new TypeError('Network request failed')))).toBeNull();
    expect(
      prepareEvent(
        {},
        new ApiError({ type: 'about:blank', title: 'x', status: 404, code: 'NOT_FOUND' }),
      ),
    ).toBeNull();
    expect(prepareEvent({}, new Error('Cannot read properties of undefined'))).not.toBeNull();
  });

  it('cleans breadcrumbs as they are recorded', () => {
    expect(prepareBreadcrumb({ data: { url: '/v1/me/shortlist?cursor=abc' } })).toEqual({
      data: { url: '/v1/me/shortlist' },
    });
  });
});
