import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  moderationDecisionSchema,
  moderationQueueQuerySchema,
  type HeldMediaPage,
  type ModerationDecision,
} from '@rt/contracts';
import type { z } from 'zod';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { body, ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import { MEDIA } from '../../application/media.use-cases.js';
import type {
  DecideHeldMediaHandler,
  ListHeldMediaQuery,
} from '../../application/moderation.use-cases.js';

@Controller('v1/moderation/media')
@UseGuards(AuthGuard)
export class ModerationController {
  constructor(
    @Inject(MEDIA.ListHeld) private readonly listHeld: ListHeldMediaQuery,
    @Inject(MEDIA.Decide) private readonly decide: DecideHeldMediaHandler,
  ) {}

  @Get()
  async queue(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodValidationPipe(moderationQueueQuerySchema))
    query: z.infer<typeof moderationQueueQuerySchema>,
  ): Promise<HeldMediaPage> {
    return unwrap(await this.listHeld.execute(principal.userId, query.cursor));
  }

  @Post(':mediaId/decision')
  @HttpCode(204)
  async decision(
    @CurrentPrincipal() principal: Principal,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
    @Body(body(moderationDecisionSchema)) decision: ModerationDecision,
  ): Promise<void> {
    unwrap(await this.decide.execute({ moderatorId: principal.userId, mediaId, decision }));
  }
}
