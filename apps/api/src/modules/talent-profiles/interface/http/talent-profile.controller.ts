import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  updateTalentProfileRequestSchema,
  type MyTalentProfile,
  type PublicTalentProfile,
  type UpdateTalentProfileRequest,
} from '@rt/contracts';
import type { FastifyReply } from 'fastify';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { formatEtag, parseIfMatch } from '../../../../platform/http/etag.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { body } from '../../../../platform/http/zod-validation.pipe.js';
import type {
  GetMyTalentProfileQuery,
  GetPublicTalentProfileQuery,
} from '../../application/get-talent-profile.queries.js';
import { TALENT } from '../../application/talent-profile.tokens.js';
import type { UpdateMyTalentProfileHandler } from '../../application/update-my-talent-profile.handler.js';

@Controller('v1')
@UseGuards(AuthGuard)
export class TalentProfileController {
  constructor(
    @Inject(TALENT.UpdateMine) private readonly updateMine: UpdateMyTalentProfileHandler,
    @Inject(TALENT.GetMine) private readonly getMine: GetMyTalentProfileQuery,
    @Inject(TALENT.GetPublic) private readonly getPublic: GetPublicTalentProfileQuery,
  ) {}

  @Get('me/talent-profile')
  async mine(
    @CurrentPrincipal() principal: Principal,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MyTalentProfile> {
    const profile = unwrap(await this.getMine.execute(principal.userId));
    void reply.header('ETag', formatEtag(profile.version));
    return profile;
  }

  @Patch('me/talent-profile')
  async update(
    @CurrentPrincipal() principal: Principal,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(body(updateTalentProfileRequestSchema)) request: UpdateTalentProfileRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<MyTalentProfile> {
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

  @Get('talents/:handle')
  async byHandle(@Param('handle') handle: string): Promise<PublicTalentProfile> {
    return unwrap(await this.getPublic.execute(handle));
  }
}
