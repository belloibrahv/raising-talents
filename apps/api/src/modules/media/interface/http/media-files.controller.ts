import { Controller, Get, Inject, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AppConfig } from '../../../../config/env.js';
import { PLATFORM } from '../../../../platform/platform.tokens.js';
import type { MediaUrls } from '../../application/media-urls.js';
import type { ObjectStorage } from '../../application/ports.js';
import { MEDIA } from '../../application/media.use-cases.js';
import { IMAGE_SIZES, type MediaAssetRepository } from '../../domain/media-asset.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILES = new Set(Object.values(IMAGE_SIZES).map((size) => `${String(size)}.webp`));

/**
 * Serves processed image variants from a private bucket when no CDN can read it (ADR-036).
 * Approved images are public, cached for a day so a deleted photo is gone by the next.
 * Anything not approved yet needs a moderator's signed preview link and is never cached.
 * Only the three variant files of a known image are served: never originals or anything else.
 */
@Controller('media')
export class MediaFilesController {
  constructor(
    @Inject(PLATFORM.Config) private readonly config: AppConfig,
    @Inject(MEDIA.Storage) private readonly storage: ObjectStorage,
    @Inject(MEDIA.Repository) private readonly assets: MediaAssetRepository,
    @Inject(MEDIA.Urls) private readonly urls: MediaUrls,
  ) {}

  @Get(':ownerId/:mediaId/:file')
  async file(
    @Param('ownerId') ownerId: string,
    @Param('mediaId') mediaId: string,
    @Param('file') file: string,
    @Query('expires') expires: string | undefined,
    @Query('signature') signature: string | undefined,
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
    const asset = await this.assets.findById(mediaId);
    if (asset?.ownerId !== ownerId || asset.kind !== 'image') throw new NotFoundException();
    const approved = asset.status === 'ready';
    if (!approved && !this.urls.verifyPreview(ownerId, mediaId, expires, signature)) {
      throw new NotFoundException();
    }
    const key = `media/${ownerId}/${mediaId}/${file}`;
    if (!(await this.storage.describe(key))) throw new NotFoundException();
    void reply
      .header('content-type', 'image/webp')
      .header('cache-control', approved ? 'public, max-age=86400' : 'private, no-store')
      .header('x-content-type-options', 'nosniff');
    return this.storage.read(key);
  }
}
