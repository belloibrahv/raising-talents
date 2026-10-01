import { Body, Controller, Get, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { selectRoleRequestSchema, type MeResponse, type SelectRoleRequest } from '@rt/contracts';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { body } from '../../../../platform/http/zod-validation.pipe.js';
import type { GetMeQuery } from '../../application/get-me.query.js';
import type { SelectRoleHandler } from '../../application/select-role.handler.js';
import { ACCOUNTS_HTTP } from './me.tokens.js';

@Controller('v1/me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    @Inject(ACCOUNTS_HTTP.GetMe) private readonly getMe: GetMeQuery,
    @Inject(ACCOUNTS_HTTP.SelectRole) private readonly selectRole: SelectRoleHandler,
  ) {}

  @Get()
  async me(@CurrentPrincipal() principal: Principal): Promise<MeResponse> {
    return unwrap(await this.getMe.execute(principal.userId));
  }

  @Post('role')
  @HttpCode(200)
  async chooseRole(
    @CurrentPrincipal() principal: Principal,
    @Body(body(selectRoleRequestSchema)) request: SelectRoleRequest,
  ): Promise<MeResponse> {
    unwrap(await this.selectRole.execute({ userId: principal.userId, role: request.role }));
    return unwrap(await this.getMe.execute(principal.userId));
  }
}
