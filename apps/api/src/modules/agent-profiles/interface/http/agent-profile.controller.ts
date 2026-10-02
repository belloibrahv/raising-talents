import { Body, Controller, Get, Headers, Inject, Patch, Res, UseGuards } from '@nestjs/common';
import {
  updateAgentProfileRequestSchema,
  type MyAgentProfile,
  type UpdateAgentProfileRequest,
} from '@rt/contracts';
import type { FastifyReply } from 'fastify';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { formatEtag, parseIfMatch } from '../../../../platform/http/etag.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { body } from '../../../../platform/http/zod-validation.pipe.js';
import {
  AGENT,
  type GetMyAgentProfileQuery,
  type UpdateMyAgentProfileHandler,
} from '../../application/agent-profile.use-cases.js';

@Controller('v1/me/agent-profile')
@UseGuards(AuthGuard)
export class AgentProfileController {
  constructor(
    @Inject(AGENT.UpdateMine) private readonly updateMine: UpdateMyAgentProfileHandler,
    @Inject(AGENT.GetMine) private readonly getMine: GetMyAgentProfileQuery,
  ) {}

  @Get()
  async mine(
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MyAgentProfile> {
    const profile = unwrap(await this.getMine.execute(principal.userId));
    void reply.header('ETag', formatEtag(profile.version));
    return profile;
  }

  @Patch()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(body(updateAgentProfileRequestSchema)) request: UpdateAgentProfileRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MyAgentProfile> {
    const profile = unwrap(
      await this.updateMine.execute({
        userId: principal.userId,
        expectedVersion: parseIfMatch(ifMatch),
        patch: request,
      }),
    );
    void reply.header('ETag', formatEtag(profile.version));
    return profile;
  }
}
