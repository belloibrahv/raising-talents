import {
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  type RawBodyRequest,
} from '@nestjs/common';
import { ErrorCode } from '@rt/contracts';
import type { FastifyRequest } from 'fastify';
import { ProblemException } from '../../../../platform/http/problem.js';
import { MEDIA, type HandleVideoProviderEventHandler } from '../../application/media.use-cases.js';
import type { VideoWebhookVerifier } from '../../application/ports.js';

/**
 * Mux calls this with no bearer token; the signature over the raw body is the proof.
 * It answers quickly: each event is one small transaction, and slow work goes to the worker.
 */
@Controller('v1/webhooks')
export class VideoWebhookController {
  constructor(
    @Inject(MEDIA.WebhookVerifier) private readonly verifier: VideoWebhookVerifier | null,
    @Inject(MEDIA.VideoEvents) private readonly events: HandleVideoProviderEventHandler,
  ) {}

  @Post('mux')
  @HttpCode(204)
  async mux(
    @Req() request: RawBodyRequest<FastifyRequest>,
    @Headers('mux-signature') signature: string | undefined,
  ): Promise<void> {
    if (!this.verifier || !request.rawBody || !this.verifier.verify(request.rawBody, signature)) {
      throw ProblemException.fromCode(
        ErrorCode.Unauthenticated,
        'The webhook signature is not valid.',
      );
    }
    const event = this.verifier.parse(request.body);
    if (event) await this.events.execute(event);
  }
}
