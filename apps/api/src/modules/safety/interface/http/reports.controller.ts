import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { createReportSchema, type CreateReport } from '@rt/contracts';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { body } from '../../../../platform/http/zod-validation.pipe.js';
import { SAFETY, type FileReportHandler } from '../../application/safety.use-cases.js';

@Controller('v1/reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(@Inject(SAFETY.File) private readonly fileReport: FileReportHandler) {}

  @Post()
  @HttpCode(204)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body(body(createReportSchema)) report: CreateReport,
  ): Promise<void> {
    unwrap(await this.fileReport.execute(principal.userId, report));
  }
}
