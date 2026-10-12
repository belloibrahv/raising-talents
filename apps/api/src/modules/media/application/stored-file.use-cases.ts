import type { Logger } from 'pino';
import type { Clock } from '../../../platform/clock.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import {
  NOT_AUDIO_REASON,
  NOT_VIDEO_REASON,
  type MediaAssetRepository,
} from '../domain/media-asset.js';
import type { ObjectStorage } from './ports.js';

/** Enough of a file to recognise it. */
const SNIFF_BYTES = 16;

const text = (file: Buffer, start: number, end: number) => file.toString('latin1', start, end);

/**
 * Whether the first bytes are those of a sound file: MP3 (with or without an ID3 tag), AAC,
 * WAV, Ogg, or an MP4 container such as M4A. The declared type alone proves nothing.
 */
export function looksLikeAudio(file: Buffer): boolean {
  if (file.length < 12) return false;
  if (text(file, 0, 3) === 'ID3' || text(file, 0, 4) === 'OggS') return true;
  if (text(file, 0, 4) === 'RIFF' && text(file, 8, 12) === 'WAVE') return true;
  if (text(file, 4, 8) === 'ftyp') return true;
  // An MPEG or ADTS frame starts with eleven set bits.
  return file[0] === 0xff && ((file[1] ?? 0) & 0xe0) === 0xe0;
}

/** MP4 and MOV open with a box named ftyp; older MOV files with moov, mdat, wide or free. */
export function looksLikeVideo(file: Buffer): boolean {
  return file.length >= 12 && ['ftyp', 'moov', 'mdat', 'wide', 'free'].includes(text(file, 4, 8));
}

/**
 * Runs in the worker for every MediaUploaded event, for the files we serve as they were
 * uploaded: recordings, and videos where there is no video provider (ADR-055, ADR-056). The
 * file is checked to be what it claims, moved to where it is served from, and goes live:
 * nothing scans these, so members report them and moderators take them down (ADR-048). The
 * file is copied inside the bucket, so a large video never passes through the worker.
 * Safe to run again.
 */
export class StoreUploadedFileHandler {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly storage: ObjectStorage,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const asset = await this.assets.findById(event.aggregateId);
    if (!asset?.servedAsFile || asset.status !== 'processing') return;

    const start = await this.storage.readStart(asset.originalKey, SNIFF_BYTES);
    const genuine = asset.kind === 'video' ? looksLikeVideo(start) : looksLikeAudio(start);
    if (!genuine) {
      asset.fail(asset.kind === 'video' ? NOT_VIDEO_REASON : NOT_AUDIO_REASON, this.clock.now());
      await this.uow.run(() => this.assets.save(asset));
      await this.storage.remove([asset.originalKey]);
      return;
    }
    await this.storage.copy(asset.originalKey, asset.fileKey);
    asset.fileStored(this.clock.now());

    // The owner may have deleted it while we worked. Saving our stale copy would bring it back.
    const discarded = await this.uow.run(async () => {
      const current = await this.assets.findById(asset.id, { lock: true });
      if (current?.status === 'deleted') return true;
      await this.assets.save(asset);
      return false;
    });
    await this.storage.remove(discarded ? asset.storedKeys : [asset.originalKey]);
    this.logger.info({ mediaId: asset.id, kind: asset.kind, discarded }, 'uploaded file stored');
  }
}
