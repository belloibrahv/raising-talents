import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { meFor, renderAt, resetSession, signedIn, stubApi } from '../../test/app-harness';

const talent = meFor({ role: 'talent', status: 'active' });

/** A stream that sends the given events a moment after opening, then stays open. */
function eventStream(events: readonly unknown[], before: () => void): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(': connected\n\n'));
      setTimeout(() => {
        before();
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      }, 300);
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

describe('live updates (ADR-041)', () => {
  beforeEach(resetSession);

  it('refreshes the Messages badge as soon as the server says a conversation changed', async () => {
    let unread = 0;
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(talent),
      'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
      'GET /v1/me/conversations/unread': () => Response.json({ unread }),
      'GET /v1/me/portfolio': () => Response.json({ items: [], maxItems: 30, version: 0 }),
      'GET /v1/me/events': () =>
        // A new request arrives while the stream is open.
        eventStream(
          [{ type: 'conversation', conversationId: '0192a3b4-0000-7000-8000-0000000000c1' }],
          () => {
            unread = 1;
          },
        ),
    });
    renderAt('/portfolio');
    expect(
      await screen.findByRole('link', { name: 'Messages, 1 need your attention' }),
    ).toBeVisible();
    const stream = calls.find((call) => call.path === '/v1/me/events');
    expect(stream?.headers['authorization']).toBe('Bearer access-1');
    // Polling would take 45 seconds; the event made it immediate.
    await waitFor(() => {
      expect(
        calls.filter((call) => call.path === '/v1/me/conversations/unread').length,
      ).toBeGreaterThan(1);
    });
  });
});
