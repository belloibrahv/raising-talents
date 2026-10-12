import {
  Controller,
  Get,
  Headers,
  Inject,
  NotFoundException,
  Param,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { AppConfig } from '../../../../config/env.js';
import { PLATFORM } from '../../../../platform/platform.tokens.js';
import type { MediaUrls } from '../../application/media-urls.js';
import type { ObjectStorage } from '../../application/ports.js';
import { MEDIA } from '../../application/media.use-cases.js';
import {
  AUDIO_FILE,
  VIDEO_FILE,
  IMAGE_SIZES,
  type MediaAsset,
  type MediaAssetRepository,
} from '../../domain/media-asset.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAYED = new Set([AUDIO_FILE, VIDEO_FILE]);
const FILES = new Set(Object.values(IMAGE_SIZES).map((size) => `${String(size)}.webp`));

/**
 * Serves processed image variants from a private bucket when no CDN can read it (ADR-036).
 * Approved images are public, cached for a day so a deleted photo is gone by the next.
 * Anything not approved yet needs a moderator's signed preview link and is never cached.
 * Only the three variant files of a known image are served, and a ready recording or stored
 * video under its one name: never originals or anything else.
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
    @Headers('range') range: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer | StreamableFile> {
    if (
      this.config.MEDIA_DELIVERY !== 'api' ||
      !UUID.test(ownerId) ||
      !UUID.test(mediaId) ||
      (!FILES.has(file) && !PLAYED.has(file))
    ) {
      throw new NotFoundException();
    }
    const asset = await this.assets.findById(mediaId);
    if (asset?.ownerId !== ownerId) throw new NotFoundException();
    if (PLAYED.has(file)) {
      // The name in the address must be the one this kind of file is kept under.
      if (!asset.fileKey.endsWith(`/${file}`)) throw new NotFoundException();
      return this.played(asset, range, reply);
    }
    if (asset.kind !== 'image') throw new NotFoundException();
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

  /**
   * A ready recording or stored video, streamed from the bucket. Players ask for a part of
   * the file to show its length and to seek, and Safari plays nothing without that, so a
   * Range header is answered with that part. Nothing is held in memory, whatever the size.
   */
  private async played(
    asset: MediaAsset,
    range: string | undefined,
    reply: FastifyReply,
  ): Promise<StreamableFile> {
    if (!asset.servedAsFile || asset.status !== 'ready') throw new NotFoundException();
    const stored = await this.storage.describe(asset.fileKey);
    if (!stored) throw new NotFoundException();
    const size = stored.bytes;
    void reply
      // MOV and MP4 are the same container; browsers that refuse "quicktime" play it as MP4.
      .header('content-type', asset.kind === 'video' ? 'video/mp4' : asset.snapshot().contentType)
      .header('cache-control', 'public, max-age=86400')
      .header('accept-ranges', 'bytes')
      .header('x-content-type-options', 'nosniff');
    const part = /^bytes=(\d*)-(\d*)$/.exec(range ?? '');
    if (!part || (part[1] === '' && part[2] === '')) {
      void reply.header('content-length', size);
      return new StreamableFile(await this.storage.stream(asset.fileKey));
    }
    const last = size - 1;
    // "bytes=-500" is the final 500 bytes; "bytes=500-" is everything from byte 500.
    const start = part[1] === '' ? Math.max(0, size - Number(part[2])) : Number(part[1]);
    const end = part[1] === '' || part[2] === '' ? last : Math.min(Number(part[2]), last);
    if (start > end || start > last) {
      void reply.status(416).header('content-range', `bytes */${String(size)}`);
      return new StreamableFile(Buffer.alloc(0));
    }
    void reply
      .status(206)
      .header('content-range', `bytes ${String(start)}-${String(end)}/${String(size)}`)
      .header('content-length', end - start + 1);
    return new StreamableFile(await this.storage.stream(asset.fileKey, { start, end }));
  }
}
