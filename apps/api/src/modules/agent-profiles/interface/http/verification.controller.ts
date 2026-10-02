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
  moderationQueueQuerySchema,
  requestAgentVerificationSchema,
  verificationDecisionSchema,
  type MyAgentVerification,
  type VerificationDecision,
  type VerificationQueuePage,
} from '@rt/contracts';
import type { z } from 'zod';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { body, ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import {
  VERIFICATION,
  type DecideVerificationHandler,
  type GetMyVerificationQuery,
  type ListPendingVerificationsQuery,
  type RequestVerificationHandler,
} from '../../application/verification.use-cases.js';

@Controller('v1')
@UseGuards(AuthGuard)
export class VerificationController {
  constructor(
    @Inject(VERIFICATION.GetMine) private readonly getMine: GetMyVerificationQuery,
    @Inject(VERIFICATION.Request) private readonly request: RequestVerificationHandler,
    @Inject(VERIFICATION.List) private readonly list: ListPendingVerificationsQuery,
    @Inject(VERIFICATION.Decide) private readonly decide: DecideVerificationHandler,
  ) {}

  @Get('me/agent-verification')
  async mine(@CurrentPrincipal() principal: Principal): Promise<MyAgentVerification> {
    return unwrap(await this.getMine.execute(principal.userId));
  }

  @Post('me/agent-verification')
  @HttpCode(201)
  async ask(
    @CurrentPrincipal() principal: Principal,
    @Body(body(requestAgentVerificationSchema))
    input: z.output<typeof requestAgentVerificationSchema>,
  ): Promise<MyAgentVerification> {
    return unwrap(await this.request.execute(principal.userId, input));
  }

  @Get('moderation/agent-verifications')
  async queue(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodValidationPipe(moderationQueueQuerySchema))
    query: z.infer<typeof moderationQueueQuerySchema>,
  ): Promise<VerificationQueuePage> {
    return unwrap(await this.list.execute(principal.userId, query.cursor));
  }

  @Post('moderation/agent-verifications/:requestId/decision')
  @HttpCode(204)
  async decision(
    @CurrentPrincipal() principal: Principal,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @Body(body(verificationDecisionSchema)) decision: VerificationDecision,
  ): Promise<void> {
    unwrap(await this.decide.execute({ moderatorId: principal.userId, requestId, decision }));
  }
}
