import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FixedClock,
  InMemoryEventRecorder,
  InMemoryRateLimiter,
  InMemoryUnitOfWork,
} from '../../../platform/testing/fakes.js';
import { createAccountsHarness } from '../../accounts/testing/accounts-harness.js';
import { MediaEvents } from '../domain/media-asset.js';
import { FakeVideoProvider } from '../testing/fake-video-provider.js';
import { InMemoryMediaAssetRepository, InMemoryObjectStorage } from '../testing/fakes.js';
import { looksLikeAudio, ProcessAudioHandler } from './audio.use-cases.js';
import { MediaFacade } from './media.facade.js';
import { MediaPresenter } from './media-presenter.js';
import { MediaUrls } from './media-urls.js';
import {
  CompleteUploadHandler,
  CreateUploadIntentHandler,
  GetMediaQuery,
} from './media.use-cases.js';

const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64, 1)]);

describe('Audio pipeline', () => {
  let clock: FixedClock;
  let events: InMemoryEventRecorder;
  let assets: InMemoryMediaAssetRepository;
  let storage: InMemoryObjectStorage;
  let createIntent: CreateUploadIntentHandler;
  let complete: CompleteUploadHandler;
  let process: ProcessAudioHandler;
  let get: GetMediaQuery;
  let facade: MediaFacade;
  let talentId: string;

  /** Asks for an intent, uploads like the browser does, confirms, and lets the worker run. */
  async function upload(body: Buffer, contentType = 'audio/mpeg'): Promise<string> {
    const intent = await createIntent.execute({
      userId: talentId,
      purpose: 'portfolio',
      contentType,
      bytes: 4_000_000,
    });
    if (!intent.ok) throw new Error(intent.error.message);
    storage.simulateUpload(intent.value.upload.fields['key'] ?? '', body, contentType);
    const done = await complete.execute({ userId: talentId, mediaId: intent.value.mediaId });
    if (!done.ok) throw new Error(done.error.message);
    for (const event of events.ofType(MediaEvents.Uploaded)) await process.handle(event);
    return intent.value.mediaId;
  }

  beforeEach(async () => {
    clock = new FixedClock();
    events = new InMemoryEventRecorder();
    const accounts = createAccountsHarness(events, clock);
    assets = new InMemoryMediaAssetRepository(events);
    storage = new InMemoryObjectStorage();
    const uow = new InMemoryUnitOfWork();
    const video = new FakeVideoProvider();
    const presenter = new MediaPresenter(
      new MediaUrls('https://media.staging.raisingtalents.app'),
      video,
    );
    createIntent = new CreateUploadIntentHandler(
      assets,
      storage,
      video,
      accounts.facade,
      new InMemoryRateLimiter(),
      clock,
    );
    complete = new CompleteUploadHandler(assets, storage, video, presenter, uow, clock);
    process = new ProcessAudioHandler(assets, storage, uow, clock, pino({ level: 'silent' }));
    get = new GetMediaQuery(assets, presenter);
    facade = new MediaFacade(assets, presenter, clock, storage, video);
    talentId = await accounts.createAccount({ email: 'ngozi.sings@example.com', role: 'talent' });
  });

  it('recognises sound files by their first bytes, whatever the name says', () => {
    const wav = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')]);
    const m4a = Buffer.concat([Buffer.alloc(4), Buffer.from('ftypM4A '), Buffer.alloc(8)]);
    const bareMp3 = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(16)]);
    const ogg = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(16)]);
    for (const file of [MP3, wav, m4a, bareMp3, ogg]) expect(looksLikeAudio(file)).toBe(true);
    expect(looksLikeAudio(Buffer.from('%PDF-1.7 not a song at all'))).toBe(false);
    expect(looksLikeAudio(Buffer.from('ID3'))).toBe(false);
  });

  it('puts a recording live at once, where it can be played', async () => {
    const mediaId = await upload(MP3);
    const view = await get.execute({ viewerId: talentId, mediaId });
    expect(view.ok && view.value).toMatchObject({
      kind: 'audio',
      status: 'ready',
      urls: null,
      video: null,
      audio: {
        url: `https://media.staging.raisingtalents.app/media/${talentId}/${mediaId}/audio`,
        contentType: 'audio/mpeg',
      },
    });
    expect(storage.objects.has(`media/${talentId}/${mediaId}/audio`)).toBe(true);
    // The upload itself is not kept once it is in place.
    expect(storage.objects.has(`pending/${talentId}/${mediaId}`)).toBe(false);
    expect(events.ofType(MediaEvents.Ready)).toHaveLength(1);
  });

  it('fails a file that only claims to be audio, and keeps nothing of it', async () => {
    const mediaId = await upload(Buffer.from('MZ this is a program, renamed to song.mp3'));
    expect(assets.rows.get(mediaId)?.status).toBe('failed');
    expect([...storage.objects.keys()].filter((key) => key.includes(mediaId))).toEqual([]);
  });

  it('refuses audio as a profile photo and anything over 20 MB', async () => {
    const asPhoto = await createIntent.execute({
      userId: talentId,
      purpose: 'avatar',
      contentType: 'audio/mpeg',
      bytes: 1000,
    });
    expect(!asPhoto.ok && asPhoto.error.code).toBe('MEDIA_TYPE_NOT_ALLOWED');
    const tooBig = await createIntent.execute({
      userId: talentId,
      purpose: 'portfolio',
      contentType: 'audio/wav',
      bytes: 21 * 1024 * 1024,
    });
    expect(!tooBig.ok && tooBig.error.code).toBe('MEDIA_TOO_LARGE');
  });

  it('removes the stored recording when the owner deletes it', async () => {
    const mediaId = await upload(MP3);
    await facade.discard(mediaId, talentId);
    expect(assets.rows.get(mediaId)?.status).toBe('deleted');
    expect(assets.rows.get(mediaId) && (await facade.describe([mediaId])).get(mediaId)?.audio).toBe(
      null,
    );
  });
});
