import type {
  SharedTalentProfile,
  MediaAsset,
  MyPortfolio,
  MyTalentProfile,
  ProblemDetails,
  PublicPortfolio,
  UploadIntentResponse,
} from '@rt/contracts';
import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, E2E_WEBHOOK_SECRET, type TestApp } from './support/create-test-app.js';

const BIO =
  'Afro-soul singer from Lekki. Backing vocals on two albums and a residency at Hard Rock Lagos.';

describe('Portfolio over HTTP', () => {
  let testApp: TestApp;
  let talent: string;
  let agent: string;

  const call = (
    method: 'GET' | 'PATCH' | 'POST' | 'PUT' | 'DELETE',
    url: string,
    token: string,
    payload?: object,
    headers: Record<string, string> = {},
  ) =>
    testApp.app.inject({
      method,
      url,
      payload,
      headers: { authorization: `Bearer ${token}`, ...headers },
    });

  async function onboard(email: string, role: 'talent' | 'agent'): Promise<string> {
    const signUp = await testApp.app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up',
      payload: {
        email,
        password: 'runway-lagos-fashion-week',
        dateOfBirth: '1999-11-23',
        countryCode: 'NG',
        acceptedTerms: true,
        deviceId: '0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b',
      },
    });
    const token = signUp.json<{ tokens: { accessToken: string } }>().tokens.accessToken;
    await testApp.deliverEvents();
    await call('POST', '/v1/auth/verify-email', token, { code: testApp.email.lastCodeFor(email) });
    await call('POST', '/v1/me/role', token, { role });
    return token;
  }

  /** What the phone does: ask for an intent, upload to storage, confirm, then the worker runs. */
  async function upload(token: string, purpose: 'avatar' | 'portfolio'): Promise<string> {
    const intent = await call('POST', '/v1/media/upload-intents', token, {
      purpose,
      contentType: 'image/jpeg',
      bytes: 1_500_000,
    });
    expect(intent.statusCode).toBe(201);
    const { mediaId, upload: target } = intent.json<UploadIntentResponse>();
    testApp.storage.simulateUpload(target.fields['key'] ?? '', Buffer.from('jpeg'), 'image/jpeg');
    const complete = await call('POST', `/v1/media/${mediaId}/complete`, token);
    expect(complete.json<MediaAsset>().status).toBe('processing');
    return mediaId;
  }

  beforeAll(async () => {
    testApp = await createTestApp();
    talent = await onboard('adaeze.okafor@example.com', 'talent');
    agent = await onboard('tunde.bakare@example.com', 'agent');
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  it('starts empty at version 0 and keeps agents out', async () => {
    const mine = await call('GET', '/v1/me/portfolio', talent);
    expect(mine.statusCode).toBe(200);
    expect(mine.headers.etag).toBe('"0"');
    expect(mine.json<MyPortfolio>()).toEqual({ items: [], maxItems: 30, version: 0 });

    const asAgent = await call('GET', '/v1/me/portfolio', agent);
    expect(asAgent.json<ProblemDetails>().code).toBe('WRONG_ROLE');
  });

  it('adds, captions, reorders and removes items, end to end with the image pipeline', async () => {
    const first = await upload(talent, 'portfolio');
    // Added while still processing: the owner sees the status, nobody else sees it yet.
    const added = await call('POST', '/v1/me/portfolio/items', talent, {
      mediaId: first,
      caption: 'Closing look, Lagos Fashion Week',
    });
    expect(added.statusCode).toBe(201);
    expect(added.json<MyPortfolio>().items[0]).toMatchObject({
      mediaId: first,
      mediaStatus: 'processing',
      urls: null,
    });

    await testApp.deliverEvents();
    const second = await upload(talent, 'portfolio');
    await testApp.deliverEvents();
    await call('POST', '/v1/me/portfolio/items', talent, { mediaId: second });

    const mine = await call('GET', '/v1/me/portfolio', talent);
    const portfolio = mine.json<MyPortfolio>();
    expect(portfolio.items.map((item) => item.mediaStatus)).toEqual(['ready', 'ready']);
    expect(portfolio.items[0]?.urls?.medium).toContain(`/media/`);
    expect(mine.headers.etag).toBe('"2"');

    const [one, two] = portfolio.items.map((item) => item.id);
    const recaptioned = await call('PATCH', `/v1/me/portfolio/items/${one ?? ''}`, talent, {
      caption: 'Eko Atlantic editorial',
    });
    expect(recaptioned.json<MyPortfolio>().items[0]?.caption).toBe('Eko Atlantic editorial');
    expect(recaptioned.headers.etag).toBe('"3"');

    const noIfMatch = await call('PUT', '/v1/me/portfolio/order', talent, { itemIds: [two, one] });
    expect(noIfMatch.statusCode).toBe(428);
    const stale = await call(
      'PUT',
      '/v1/me/portfolio/order',
      talent,
      { itemIds: [two, one] },
      { 'if-match': '"2"' },
    );
    expect(stale.statusCode).toBe(412);
    const partial = await call(
      'PUT',
      '/v1/me/portfolio/order',
      talent,
      { itemIds: [two] },
      { 'if-match': '"3"' },
    );
    expect(partial.json<ProblemDetails>().code).toBe('PORTFOLIO_ORDER_MISMATCH');
    const reordered = await call(
      'PUT',
      '/v1/me/portfolio/order',
      talent,
      { itemIds: [two, one] },
      { 'if-match': '"3"' },
    );
    expect(reordered.statusCode).toBe(200);
    expect(reordered.json<MyPortfolio>().items.map((item) => item.id)).toEqual([two, one]);

    const removed = await call('DELETE', `/v1/me/portfolio/items/${two ?? ''}`, talent);
    expect(removed.statusCode).toBe(200);
    expect(removed.json<MyPortfolio>().items.map((item) => item.id)).toEqual([one]);
    // The media is released with the item, and the worker removes its files.
    expect(testApp.mediaAssets.rows.get(second)?.status).toBe('deleted');
    await testApp.deliverEvents();
    expect([...testApp.storage.objects.keys()].some((key) => key.includes(second))).toBe(false);
    expect([...testApp.storage.objects.keys()].some((key) => key.includes(first))).toBe(true);
  });

  it('refuses avatars, files already used, and other people’s files', async () => {
    const avatar = await upload(talent, 'avatar');
    const asAvatar = await call('POST', '/v1/me/portfolio/items', talent, { mediaId: avatar });
    expect(asAvatar.json<ProblemDetails>().code).toBe('MEDIA_WRONG_PURPOSE');

    const [item] = (await call('GET', '/v1/me/portfolio', talent)).json<MyPortfolio>().items;
    const twice = await call('POST', '/v1/me/portfolio/items', talent, { mediaId: item?.mediaId });
    expect(twice.json<ProblemDetails>().code).toBe('MEDIA_ALREADY_USED');

    const otherTalent = await onboard('zainab.musa@example.com', 'talent');
    const theirs = await call('POST', '/v1/me/portfolio/items', otherTalent, {
      mediaId: item?.mediaId,
    });
    expect(theirs.statusCode).toBe(404);
  });

  it('shows ready items to agents once the profile is complete, and the same 404 before', async () => {
    const before = await call('GET', '/v1/talents/adaeze.okafor/portfolio', agent);
    expect(before.statusCode).toBe(404);

    const profile = await call('PATCH', '/v1/me/talent-profile', talent, {
      handle: 'adaeze.okafor',
      displayName: 'Adaeze Okafor',
    });
    const etag = profile.headers.etag as string;
    await call(
      'PATCH',
      '/v1/me/talent-profile',
      talent,
      {
        categorySlug: 'music',
        subcategorySlugs: ['singer'],
        citySlug: 'ng-lagos',
        bio: BIO,
      },
      { 'if-match': etag },
    );
    // An approved avatar is the last missing field, so it completes the profile.
    await upload(talent, 'avatar');
    await testApp.deliverEvents();
    const mine = (await call('GET', '/v1/me/talent-profile', talent)).json<MyTalentProfile>();
    expect(mine.missing).toEqual([]);

    // A new item still processing is not shown to agents.
    const pending = await upload(talent, 'portfolio');
    await call('POST', '/v1/me/portfolio/items', talent, { mediaId: pending });

    const shown = await call('GET', '/v1/talents/adaeze.okafor/portfolio', agent);
    expect(shown.statusCode).toBe(200);
    const items = shown.json<PublicPortfolio>().items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: 'image', caption: 'Eko Atlantic editorial' });
    expect(items[0]).not.toHaveProperty('mediaId');
  });

  it('shares a page with anyone only once the talent turns the link on (ADR-042)', async () => {
    const open = (code: string) => testApp.app.inject({ method: 'GET', url: `/v1/shared/${code}` });
    const before = await call('GET', '/v1/me/talent-profile', talent);
    expect(before.json<MyTalentProfile>().shareCode).toBeNull();
    expect((await open('adaeze.okafor')).statusCode).toBe(404);

    const turnedOn = await call(
      'PATCH',
      '/v1/me/talent-profile',
      talent,
      { publicLink: true },
      { 'if-match': before.headers.etag as string },
    );
    const on = turnedOn.json<MyTalentProfile>();
    expect(on.publicLink).toBe(true);
    expect(on.shareCode).toMatch(/^[A-Za-z0-9_-]{8}$/);
    const code = on.shareCode ?? '';

    const shared = await open(code);
    expect(shared.statusCode).toBe(200);
    const page = shared.json<SharedTalentProfile>();
    expect(page).toMatchObject({
      handle: 'adaeze.okafor',
      displayName: 'Adaeze Okafor',
      discipline: 'Singer',
      city: 'Lagos',
    });
    expect(page.portfolio.length).toBeGreaterThan(0);
    // Agents see age in years; strangers on the internet see neither age nor gender.
    expect(page).not.toHaveProperty('ageYears');
    expect(page).not.toHaveProperty('gender');

    // A new handle keeps the same link: it can never point at whoever takes the old handle.
    const renamed = await call(
      'PATCH',
      '/v1/me/talent-profile',
      talent,
      { handle: 'adaeze.sings' },
      { 'if-match': turnedOn.headers.etag as string },
    );
    expect(renamed.json<MyTalentProfile>().shareCode).toBe(code);
    expect((await open(code)).json<SharedTalentProfile>().handle).toBe('adaeze.sings');
    // Back to the handle the next test expects.
    await call(
      'PATCH',
      '/v1/me/talent-profile',
      talent,
      { handle: 'adaeze.okafor' },
      { 'if-match': renamed.headers.etag as string },
    );
  });

  /** What Mux sends: the JSON body, signed over its exact bytes. */
  function muxWebhook(payload: object, secret = E2E_WEBHOOK_SECRET) {
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(testApp.clock.now().getTime() / 1000);
    const signature = createHmac('sha256', secret)
      .update(`${String(timestamp)}.${body}`)
      .digest('hex');
    return testApp.app.inject({
      method: 'POST',
      url: '/v1/webhooks/mux',
      payload: body,
      headers: {
        'content-type': 'application/json',
        'mux-signature': `t=${String(timestamp)},v1=${signature}`,
      },
    });
  }

  it('refuses webhooks without a valid signature', async () => {
    const payload = { type: 'video.asset.errored', data: { passthrough: 'x' } };
    const forged = await muxWebhook(payload, 'not-the-secret');
    expect(forged.statusCode).toBe(401);
    const unsigned = await testApp.app.inject({ method: 'POST', url: '/v1/webhooks/mux', payload });
    expect(unsigned.statusCode).toBe(401);
  });

  it('adds a video that plays for agents once Mux has transcoded it and every frame is clean', async () => {
    const intent = await call('POST', '/v1/media/upload-intents', talent, {
      purpose: 'portfolio',
      contentType: 'video/mp4',
      bytes: 52_000_000,
    });
    expect(intent.statusCode).toBe(201);
    const { mediaId, upload } = intent.json<UploadIntentResponse>();
    expect(upload).toMatchObject({ method: 'PUT', fields: {} });

    const uploadId = upload.url.split('/').pop() ?? '';
    const assetId = testApp.video.receiveFile(uploadId);
    const created = await muxWebhook({
      type: 'video.upload.asset_created',
      data: { id: uploadId, asset_id: assetId, new_asset_settings: { passthrough: mediaId } },
    });
    expect(created.statusCode).toBe(204);
    // The phone's own complete call arrives after the webhook and just reports progress.
    const complete = await call('POST', `/v1/media/${mediaId}/complete`, talent);
    expect(complete.json<MediaAsset>()).toMatchObject({ kind: 'video', status: 'processing' });

    await call('POST', '/v1/me/portfolio/items', talent, {
      mediaId,
      caption: 'Live at Hard Rock Lagos, acoustic set',
    });
    const readyEvent = {
      type: 'video.asset.ready',
      data: {
        id: assetId,
        passthrough: mediaId,
        duration: 47.3,
        playback_ids: [{ id: 'signed-playback-1', policy: 'signed' }],
      },
    };
    expect((await muxWebhook(readyEvent)).statusCode).toBe(204);
    // Mux retries; a repeat must not change anything.
    expect((await muxWebhook(readyEvent)).statusCode).toBe(204);
    await testApp.deliverEvents();

    const mine = (await call('GET', '/v1/me/portfolio', talent)).json<MyPortfolio>();
    const item = mine.items.find((candidate) => candidate.mediaId === mediaId);
    expect(item).toMatchObject({
      kind: 'video',
      mediaStatus: 'ready',
      urls: null,
      video: { durationSeconds: 47.3 },
    });
    expect(item?.video?.streamUrl).toContain('signed-playback-1');

    const shown = (
      await call('GET', '/v1/talents/adaeze.okafor/portfolio', agent)
    ).json<PublicPortfolio>();
    const video = shown.items.find((candidate) => candidate.kind === 'video');
    expect(video?.caption).toBe('Live at Hard Rock Lagos, acoustic set');
    expect(video?.kind === 'video' && video.video.posterUrl).toContain('signed-playback-1');
  });
});
