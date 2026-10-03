import { toReport } from './should-report';

/** "https://app/search?q=ada#x" becomes "https://app/search": queries hold what people typed. */
export function withoutQuery(url: string): string {
  return url.split(/[?#]/)[0] ?? url;
}

interface EventLike {
  request?: {
    url?: string;
    data?: unknown;
    cookies?: unknown;
    headers?: unknown;
    query_string?: unknown;
  };
  breadcrumbs?: { data?: Record<string, unknown> }[];
}

/**
 * The last look at every event before it leaves the browser, whatever captured it (our code
 * or the SDK's global handlers). Drops what should not be reported, then removes anything
 * personal: request bodies, cookies, headers, and the query strings of every URL.
 */
export function prepareEvent<E extends EventLike>(event: E, originalException: unknown): E | null {
  if (originalException !== undefined && toReport(originalException) === null) return null;
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.url) event.request.url = withoutQuery(event.request.url);
  }
  for (const crumb of event.breadcrumbs ?? []) {
    for (const key of ['url', 'from', 'to'] as const) {
      const value = crumb.data?.[key];
      if (typeof value === 'string' && crumb.data) crumb.data[key] = withoutQuery(value);
    }
  }
  return event;
}

/** Breadcrumbs are cleaned as they are recorded too, so nothing personal sits in memory. */
export function prepareBreadcrumb<B extends { data?: Record<string, unknown> }>(crumb: B): B {
  for (const key of ['url', 'from', 'to'] as const) {
    const value = crumb.data?.[key];
    if (typeof value === 'string' && crumb.data) crumb.data[key] = withoutQuery(value);
  }
  return crumb;
}
