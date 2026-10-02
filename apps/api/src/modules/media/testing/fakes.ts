import type { EventRecorder } from '../../../platform/domain-event.js';
import type {
  ContentScanner,
  ImageProcessor,
  ImageVariant,
  ObjectStorage,
  PresignedUpload,
} from '../application/ports.js';
import { InvalidImageError } from '../application/ports.js';
import { MediaAsset, type MediaAssetRepository } from '../domain/media-asset.js';

export class InMemoryMediaAssetRepository implements MediaAssetRepository {
  readonly rows = new Map<string, ReturnType<MediaAsset['snapshot']>>();
  constructor(private readonly events: EventRecorder) {}

  async findById(id: string): Promise<MediaAsset | null> {
    const row = this.rows.get(id);
    return row ? MediaAsset.restore(row) : null;
  }

  async findByIds(ids: readonly string[]): Promise<MediaAsset[]> {
    return ids.flatMap((id) => {
      const row = this.rows.get(id);
      return row ? [MediaAsset.restore(row)] : [];
    });
  }

  async findHeld(after: { heldAt: Date; id: string } | null, limit: number): Promise<MediaAsset[]> {
    return [...this.rows.values()]
      .filter((row) => row.status === 'held_for_review')
      .sort((a, b) => a.updatedAt.getTime() - b.updatedAt.getTime() || a.id.localeCompare(b.id))
      .filter(
        (row) =>
          after === null ||
          row.updatedAt > after.heldAt ||
          (row.updatedAt.getTime() === after.heldAt.getTime() && row.id > after.id),
      )
      .slice(0, limit)
      .map((row) => MediaAsset.restore(row));
  }

  async findAbandoned(createdBefore: Date, limit: number): Promise<MediaAsset[]> {
    return [...this.rows.values()]
      .filter((row) => row.status === 'awaiting_upload' && row.createdAt < createdBefore)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit)
      .map((row) => MediaAsset.restore(row));
  }

  async save(asset: MediaAsset): Promise<void> {
    this.rows.set(asset.id, asset.snapshot());
    await this.events.record(asset.pullEvents());
  }
}

/** Stores objects in memory and records each presigned upload's conditions. */
export class InMemoryObjectStorage implements ObjectStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  readonly presigned: { key: string; contentType: string; maxBytes: number }[] = [];

  async presignUpload(input: {
    key: string;
    contentType: string;
    maxBytes: number;
  }): Promise<PresignedUpload> {
    this.presigned.push(input);
    return {
      url: 'https://uploads.test/media-bucket',
      fields: { key: input.key, 'Content-Type': input.contentType },
    };
  }
  async describe(key: string) {
    const object = this.objects.get(key);
    return object ? { bytes: object.body.length, contentType: object.contentType } : null;
  }
  async read(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object) throw new Error(`No object at ${key}`);
    return object.body;
  }
  async write(key: string, body: Buffer, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
  }
  async remove(keys: readonly string[]): Promise<void> {
    for (const key of keys) this.objects.delete(key);
  }
  /** What the phone does with the presigned POST. */
  simulateUpload(key: string, body: Buffer, contentType: string): void {
    this.objects.set(key, { body, contentType });
  }
}

/** Produces three tiny variants; bodies starting with "not-an-image" are refused. */
export class FakeImageProcessor implements ImageProcessor {
  async process(original: Buffer): Promise<readonly ImageVariant[]> {
    if (original.toString().startsWith('not-an-image'))
      throw new InvalidImageError('Not a readable image');
    return (['small', 'medium', 'large'] as const).map((size) => ({
      size,
      body: Buffer.from(`webp-${size}`),
    }));
  }
}

export class ScriptedScanner implements ContentScanner {
  labels: { name: string; parentName: string | null; confidence: number }[] = [];
  failNext = false;
  async scanImage() {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('Rekognition throttled the request');
    }
    return this.labels;
  }
}
