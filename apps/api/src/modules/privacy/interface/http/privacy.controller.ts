import { Body, Controller, Get, HttpCode, Inject, Post, Res, UseGuards } from '@nestjs/common';
import {
  requestDeletionSchema,
  type DataExport,
  type MeResponse,
  type RequestDeletion,
} from '@rt/contracts';
import type { FastifyReply } from 'fastify';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { body } from '../../../../platform/http/zod-validation.pipe.js';
import {
  PRIVACY,
  type CancelDeletionHandler,
  type ExportMyDataQuery,
  type RequestDeletionHandler,
} from '../../application/privacy.use-cases.js';

@Controller('v1/me')
@UseGuards(AuthGuard)
export class PrivacyController {
  constructor(
    @Inject(PRIVACY.RequestDeletion) private readonly requestDeletion: RequestDeletionHandler,
    @Inject(PRIVACY.CancelDeletion) private readonly cancelDeletion: CancelDeletionHandler,
    @Inject(PRIVACY.Export) private readonly exportData: ExportMyDataQuery,
  ) {}

  @Post('deletion')
  @HttpCode(200)
  async delete(
    @CurrentPrincipal() principal: Principal,
    @Body(body(requestDeletionSchema)) request: RequestDeletion,
  ): Promise<MeResponse> {
    return unwrap(await this.requestDeletion.execute(principal.userId, request.password));
  }

  @Post('deletion/cancel')
  @HttpCode(200)
  async keep(@CurrentPrincipal() principal: Principal): Promise<MeResponse> {
    return unwrap(await this.cancelDeletion.execute(principal.userId));
  }

  @Get('export')
  async export(
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<DataExport> {
    const data = unwrap(await this.exportData.execute(principal.userId));
    // Personal data: never kept by a browser or proxy cache.
    void reply.header('cache-control', 'no-store');
    void reply.header('content-disposition', 'attachment; filename="raising-talents-data.json"');
    return data;
  }
}
