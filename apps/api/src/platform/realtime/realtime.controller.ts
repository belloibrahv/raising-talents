import { Controller, Get, Inject, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AuthGuard } from '../http/auth.guard.js';
import type { Principal } from '../http/authenticated-request.js';
import { CurrentPrincipal } from '../http/current-principal.decorator.js';
import { PLATFORM } from '../platform.tokens.js';
import type { Realtime } from './realtime.js';

/** Under the web server's 30-second idle cut-off, so a quiet stream stays open (ADR-036). */
const HEARTBEAT_MS = 15_000;

/**
 * Server-sent events for the signed-in person (ADR-041). Writes still go over REST
 * (ADR-009); this only says "something changed, fetch it again".
 */
@Controller('v1/me/events')
@UseGuards(AuthGuard)
export class RealtimeController {
  constructor(@Inject(PLATFORM.Realtime) private readonly realtime: Realtime) {}

  @Get()
  async stream(
    @CurrentPrincipal() principal: Principal,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    reply.hijack();
    const raw = reply.raw;
    // Keeps CORS and trace headers that hooks already set on the reply.
    raw.writeHead(200, {
      ...(reply.getHeaders() as Record<string, string>),
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Stops proxies that buffer from holding events back.
      'x-accel-buffering': 'no',
    });
    raw.write('retry: 5000\n\n');
    raw.write(': connected\n\n');
    const send = (event: unknown) => {
      raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };
    const stop = await this.realtime.subscribe(principal.userId, send);
    const heartbeat = setInterval(() => raw.write(': ping\n\n'), HEARTBEAT_MS);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      stop();
    });
  }
}
