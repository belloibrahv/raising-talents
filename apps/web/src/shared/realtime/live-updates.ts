import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { http } from '../api/client';

/**
 * Whether this tab is hearing server events right now. Polling slows down while it is, and
 * speeds back up when the stream drops (ADR-041).
 */
export const liveStatus = { connected: false };

/** How often to poll: quickly without the stream, rarely with it, as a safety net. */
export const pollEvery = (withoutStream: number, withStream: number) => () =>
  liveStatus.connected ? withStream : withoutStream;

type LiveEvent = { type: 'conversation'; conversationId: string } | { type: 'notifications' };

const FIRST_RETRY_MS = 2_000;
const LONGEST_RETRY_MS = 60_000;

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

/**
 * Listens to /v1/me/events while signed in and refetches what changed. The stream only
 * says "something changed"; the data still comes from the usual requests.
 */
export function useLiveUpdates(enabled: boolean): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const { signal } = controller;

    const handle = (block: string) => {
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trim())
        .join('');
      if (!data) return;
      let event: LiveEvent;
      try {
        event = JSON.parse(data) as LiveEvent;
      } catch {
        return;
      }
      if (event.type === 'conversation') {
        void queryClient.invalidateQueries({ queryKey: ['messages'] });
      } else {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
    };

    const run = async () => {
      let retry = FIRST_RETRY_MS;
      while (!signal.aborted) {
        try {
          const response = await http.openStream('/v1/me/events', signal);
          // 204 means this server has no stream: polling carries on as before.
          if (response.status === 204) return;
          if (!response.ok || !response.body) throw new Error(`stream ${String(response.status)}`);
          liveStatus.connected = true;
          retry = FIRST_RETRY_MS;
          // Catch up on anything missed while the stream was down.
          void queryClient.invalidateQueries({ queryKey: ['messages'] });
          void queryClient.invalidateQueries({ queryKey: ['notifications'] });
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let end = buffer.indexOf('\n\n');
            while (end >= 0) {
              handle(buffer.slice(0, end));
              buffer = buffer.slice(end + 2);
              end = buffer.indexOf('\n\n');
            }
          }
        } catch {
          // Offline, signed out or the server restarted: wait, then try again.
        } finally {
          liveStatus.connected = false;
        }
        await wait(retry, signal);
        retry = Math.min(retry * 2, LONGEST_RETRY_MS);
      }
    };
    void run();
    return () => {
      controller.abort();
      liveStatus.connected = false;
    };
  }, [enabled, queryClient]);
}
