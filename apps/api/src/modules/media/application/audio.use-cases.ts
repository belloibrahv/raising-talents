import type { Logger } from 'pino';
import type { Clock } from '../../../platform/clock.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import { NOT_AUDIO_REASON, type MediaAssetRepository } from '../domain/media-asset.js';
import type { ObjectStorage } from './ports.js';

/**
 * Whether the first bytes are those of a sound file: MP3 (with or without an ID3 tag), AAC,
 * WAV, Ogg, or an MP4 container such as M4A. The declared type alone proves nothing.
 */
export function looksLikeAudio(file: Buffer): boolean {
  if (file.length < 12) return false;
  const text = (start: number, end: number) => file.toString('latin1', start, end);
  if (text(0, 3) === 'ID3' || text(0, 4) === 'OggS') return true;
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WAVE') return true;
  if (text(4, 8) === 'ftyp') return true;
  // An MPEG or ADTS frame starts with eleven set bits.
  return file[0] === 0xff && ((file[1] ?? 0) & 0xe0) === 0xe0;
}

/**
 * Runs in the worker for every MediaUploaded event. A recording is checked to be a sound
 * file, moved to where it is served from, and goes live: nothing scans audio, so members
 * report it and moderators take it down (ADR-048, ADR-055). Safe to run again.
 */
export class ProcessAudioHandler {
  constructor(
    private readonly assets: MediaAssetRepository,
    private readonly storage: ObjectStorage,
    private readonly uow: UnitOfWork,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    const asset = await this.assets.findById(event.aggregateId);
    if (asset?.kind !== 'audio' || asset.status !== 'processing') return;

    const original = await this.storage.read(asset.originalKey);
    if (!looksLikeAudio(original)) {
      asset.fail(NOT_AUDIO_REASON, this.clock.now());
      await this.uow.run(() => this.assets.save(asset));
      await this.storage.remove([asset.originalKey]);
      return;
    }
    await this.storage.write(asset.audioKey, original, asset.snapshot().contentType);
    asset.audioStored(this.clock.now());

    // The owner may have deleted it while we worked. Saving our stale copy would bring it back.
    const discarded = await this.uow.run(async () => {
      const current = await this.assets.findById(asset.id, { lock: true });
      if (current?.status === 'deleted') return true;
      await this.assets.save(asset);
      return false;
    });
    await this.storage.remove(discarded ? asset.storedKeys : [asset.originalKey]);
    this.logger.info({ mediaId: asset.id, discarded }, 'audio stored');
  }
}
