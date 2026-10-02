import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  createUploadIntentRequestSchema,
  type CreateUploadIntentRequest,
  type MediaAsset,
  type UploadIntentResponse,
} from '@rt/contracts';
import { AuthGuard } from '../../../../platform/http/auth.guard.js';
import type { Principal } from '../../../../platform/http/authenticated-request.js';
import { CurrentPrincipal } from '../../../../platform/http/current-principal.decorator.js';
import { unwrap } from '../../../../platform/http/problem.js';
import { body } from '../../../../platform/http/zod-validation.pipe.js';
import {
  MEDIA,
  type CompleteUploadHandler,
  type CreateUploadIntentHandler,
  type GetMediaQuery,
} from '../../application/media.use-cases.js';

@Controller('v1/media')
@UseGuards(AuthGuard)
export class MediaController {
  constructor(
    @Inject(MEDIA.CreateIntent) private readonly createIntent: CreateUploadIntentHandler,
    @Inject(MEDIA.Complete) private readonly complete: CompleteUploadHandler,
    @Inject(MEDIA.Get) private readonly getMedia: GetMediaQuery,
  ) {}

  @Post('upload-intents')
  @HttpCode(201)
  async intent(
    @CurrentPrincipal() principal: Principal,
    @Body(body(createUploadIntentRequestSchema)) request: CreateUploadIntentRequest,
  ): Promise<UploadIntentResponse> {
    return unwrap(await this.createIntent.execute({ userId: principal.userId, ...request }));
  }

  @Post(':mediaId/complete')
  @HttpCode(202)
  async completeUpload(
    @CurrentPrincipal() principal: Principal,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ): Promise<MediaAsset> {
    return unwrap(await this.complete.execute({ userId: principal.userId, mediaId }));
  }

  @Get(':mediaId')
  async get(
    @CurrentPrincipal() principal: Principal,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ): Promise<MediaAsset> {
    return unwrap(await this.getMedia.execute({ viewerId: principal.userId, mediaId }));
  }
}
