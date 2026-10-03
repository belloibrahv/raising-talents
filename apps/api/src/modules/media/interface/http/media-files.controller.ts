import { Controller, Get, Inject, NotFoundException, Param, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AppConfig } from '../../../../config/env.js';
import { PLATFORM } from '../../../../platform/platform.tokens.js';
import type { ObjectStorage } from '../../application/ports.js';
import { MEDIA } from '../../application/media.use-cases.js';
import { IMAGE_SIZES } from '../../domain/media-asset.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILES = new Set(Object.values(IMAGE_SIZES).map((size) => `${String(size)}.webp`));

/**
 * Serves processed image variants from a private bucket when no CDN can read it (ADR-036).
 * Only the three variant files of a media id are served: never originals or anything else.
 * Variants never change at an address, so browsers and the CDN in front keep them a year.
 */
@Controller('media')
export class MediaFilesController {
  constructor(
    @Inject(PLATFORM.Config) private readonly config: AppConfig,
    @Inject(MEDIA.Storage) private readonly storage: ObjectStorage,
  ) {}

  @Get(':ownerId/:mediaId/:file')
  async file(
    @Param('ownerId') ownerId: string,
    @Param('mediaId') mediaId: string,
    @Param('file') file: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    if (
      this.config.MEDIA_DELIVERY !== 'api' ||
      !UUID.test(ownerId) ||
      !UUID.test(mediaId) ||
      !FILES.has(file)
    ) {
      throw new NotFoundException();
    }
    const key = `media/${ownerId}/${mediaId}/${file}`;
    const stored = await this.storage.describe(key);
    if (!stored) throw new NotFoundException();
    void reply
      .header('content-type', 'image/webp')
      .header('cache-control', 'public, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff');
    return this.storage.read(key);
  }
}
