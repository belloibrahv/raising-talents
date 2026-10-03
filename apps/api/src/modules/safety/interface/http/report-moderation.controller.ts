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
  reportDecisionSchema,
  type ReportDecision,
  type ReportQueuePage,
} from '@rt/contracts';
import type { z } from 'zod';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { body, ZodValidationPipe } from '../../../../platform/http/zod-validation.pipe.js';
import {
  SAFETY,
  type DecideReportsHandler,
  type ListReportedAccountsQuery,
} from '../../application/safety.use-cases.js';

@Controller('v1/moderation/reports')
@UseGuards(AuthGuard)
export class ReportModerationController {
  constructor(
    @Inject(SAFETY.List) private readonly listReported: ListReportedAccountsQuery,
    @Inject(SAFETY.Decide) private readonly decide: DecideReportsHandler,
  ) {}

  @Get()
  async queue(
    @CurrentPrincipal() principal: Principal,
    @Query(new ZodValidationPipe(moderationQueueQuerySchema))
    query: z.infer<typeof moderationQueueQuerySchema>,
  ): Promise<ReportQueuePage> {
    return unwrap(await this.listReported.execute(principal.userId, query.cursor));
  }

  @Post(':accountId/decision')
  @HttpCode(204)
  async decision(
    @CurrentPrincipal() principal: Principal,
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Body(body(reportDecisionSchema)) decision: ReportDecision,
  ): Promise<void> {
    unwrap(await this.decide.execute({ moderatorId: principal.userId, accountId, decision }));
  }
}
