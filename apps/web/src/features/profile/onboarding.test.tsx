import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expectNoAxeViolations,
  meFor,
  problem,
  renderAt,
  resetSession,
  signedIn,
  stubApi,
  citiesRoutes,
  TAXONOMY,
  type Call,
} from '../../test/app-harness';

const USER = '0192a3b4-0000-7000-8000-000000000001';
const AVATAR = '0192a3b4-0000-7000-8000-0000000000aa';

/** A talent profile endpoint that behaves like the API: versions, If-Match and what is missing. */
class FakeTalentProfile {
  profile: Record<string, unknown> | null = null;
  bumpBehindTheScenes = false;

  get = () => (this.profile ? Response.json(this.view()) : problem(404, 'NOT_FOUND'));

  patch = (call: Call) => {
    const ifMatch = call.headers['if-match'];
    if (this.profile && !ifMatch) return problem(428, 'PRECONDITION_REQUIRED');
    if (this.bumpBehindTheScenes && this.profile) {
      this.bumpBehindTheScenes = false;
      this.profile['version'] = Number(this.profile['version']) + 1;
    }
    if (this.profile && ifMatch !== `"${String(this.profile['version'])}"`)
      return problem(412, 'PRECONDITION_FAILED');
    const patch = call.body as Record<string, unknown>;
    const base = this.profile ?? {
      userId: USER,
      handle: 'ngozi.adeyemi',
      displayName: null,
      bio: '',
      categorySlug: null,
      subcategorySlugs: [],
      skillSlugs: [],
      citySlug: null,
      gender: null,
      genderSearchable: false,
      publicLink: false,
      shareCode: null,
      photoInReview: false,
      avatarMediaId: null,
      version: 0,
    };
    this.profile = { ...base, ...patch, version: Number(base['version']) + 1 };
    return Response.json(this.view());
  };

  view() {
    const p = this.profile ?? {};
    const category = TAXONOMY.categories.find((entry) => entry.slug === p['categorySlug']);
    const missing = [
      !p['displayName'] && 'displayName',
      !category && 'category',
      !(p['subcategorySlugs'] as string[] | undefined)?.length && 'subcategories',
      !p['citySlug'] && 'city',
      ((p['bio'] as string | undefined) ?? '').length < 50 && 'bio',
      !p['avatarMediaId'] && 'avatar',
    ].filter(Boolean);
    return {
      userId: USER,
      handle: p['handle'],
      displayName: p['displayName'] ?? null,
      bio: p['bio'] ?? '',
      category: category ? { slug: category.slug, name: category.name } : null,
      subcategories: ((p['subcategorySlugs'] as string[] | undefined) ?? []).map((slug) => ({
        slug,
        name: slug,
      })),
      skills: ((p['skillSlugs'] as string[] | undefined) ?? []).map((slug) => ({
        slug,
        name: slug,
      })),
      city: p['citySlug'] ? { slug: p['citySlug'], name: 'Lagos', countryCode: 'NG' } : null,
      gender: p['gender'] ?? null,
      genderSearchable: p['genderSearchable'] ?? false,
      publicLink: p['publicLink'] ?? false,
      shareCode: null,
      photoInReview: false,
      avatarMediaId: p['avatarMediaId'] ?? null,
      avatarUrls: p['avatarMediaId']
        ? {
            small: 'https://media.test/s.webp',
            medium: 'https://media.test/m.webp',
            large: 'https://media.test/l.webp',
          }
        : null,
      isComplete: missing.length === 0,
      missing,
      version: p['version'],
      updatedAt: '2026-10-02T09:00:00.000Z',
    };
  }
}

/** XMLHttpRequest as the browser would run the presigned upload: progress, then success. */
class FakeUploadRequest {
  static sent: { method: string; url: string; body: unknown }[] = [];
  upload: {
    onprogress:
      ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  } = {
    onprogress: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  private method = '';
  private url = '';
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader() {}
  abort() {}
  send(body: unknown) {
    FakeUploadRequest.sent.push({ method: this.method, url: this.url, body });
    setTimeout(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
      this.status = 204;
      this.onload?.();
    }, 0);
  }
}

describe('talent onboarding', () => {
  beforeEach(resetSession);

  it('walks the steps, creating the profile first and then sending the version each time', async () => {
    const fake = new FakeTalentProfile();
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(),
      '/v1/taxonomy': () => Response.json(TAXONOMY),
      ...citiesRoutes,
      'GET /v1/me/talent-profile': fake.get,
      'PATCH /v1/me/talent-profile': fake.patch,
    });
    const router = renderAt('/home');
    const user = userEvent.setup({ delay: null });

    expect(await screen.findByRole('heading', { level: 1, name: 'About you' })).toBeVisible();
    const steps = screen.getByRole('list', { name: 'Set up your profile' });
    expect(within(steps).getByText('About')).toHaveAttribute('aria-current', 'step');
    expect(within(steps).getAllByRole('listitem')).toHaveLength(5);
    await expectNoAxeViolations();
    await user.type(screen.getByLabelText('Your name'), 'Ngozi Adeyemi');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Your discipline' })).toBeVisible();
    await user.click(screen.getByRole('radio', { name: 'Music' }));
    await user.click(screen.getByRole('checkbox', { name: 'Singer' }));
    await expectNoAxeViolations();
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Where you are' })).toBeVisible();
    await user.type(screen.getByRole('combobox', { name: 'Country' }), 'naija');
    await user.click(await screen.findByRole('option', { name: 'Nigeria' }));
    await user.click(screen.getByRole('combobox', { name: 'City' }));
    await user.click(await screen.findByRole('option', { name: 'Lagos' }));
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Your story' })).toBeVisible();
    const bio = screen.getByLabelText('About you');
    await user.type(bio, 'Afro-soul singer.');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));
    await waitFor(() => expect(bio).toHaveFocus());
    expect(bio).toHaveAccessibleDescription(/Write at least 50 characters\./);
    await user.type(bio, ' Backing vocals on two albums and a residency in Lekki.');
    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Your profile photo' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/onboarding/talent/photo');

    const patches = calls.filter((call) => call.method === 'PATCH');
    expect(patches.map((call) => call.headers['if-match'])).toEqual([
      undefined,
      '"1"',
      '"2"',
      '"3"',
    ]);
    expect(patches[1]?.body).toEqual({
      categorySlug: 'music',
      subcategorySlugs: ['singer'],
      skillSlugs: [],
    });
  });

  it('resumes at the first step with something missing', async () => {
    const fake = new FakeTalentProfile();
    fake.profile = {
      userId: USER,
      handle: 'ngozi.adeyemi',
      displayName: 'Ngozi Adeyemi',
      categorySlug: 'music',
      subcategorySlugs: ['singer'],
      skillSlugs: [],
      citySlug: null,
      bio: '',
      version: 2,
    };
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(),
      '/v1/taxonomy': () => Response.json(TAXONOMY),
      ...citiesRoutes,
      'GET /v1/me/talent-profile': fake.get,
    });
    const router = renderAt('/home');
    expect(await screen.findByRole('heading', { level: 1, name: 'Where you are' })).toBeVisible();
    expect(router.state.location.pathname).toBe('/onboarding/talent/location');
  });

  it('reloads the profile and says why when another device saved first', async () => {
    const fake = new FakeTalentProfile();
    fake.profile = { userId: USER, handle: 'ngozi.adeyemi', displayName: 'Ngozi', version: 4 };
    fake.bumpBehindTheScenes = true;
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(),
      '/v1/taxonomy': () => Response.json(TAXONOMY),
      ...citiesRoutes,
      'GET /v1/me/talent-profile': fake.get,
      'PATCH /v1/me/talent-profile': fake.patch,
    });
    renderAt('/onboarding/talent/about');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Save and continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/changed on another device/);
  });

  it('uploads the photo, follows the scan, and completes the profile once the worker attaches it', async () => {
    const fake = new FakeTalentProfile();
    fake.profile = {
      userId: USER,
      handle: 'ngozi.adeyemi',
      displayName: 'Ngozi Adeyemi',
      categorySlug: 'music',
      subcategorySlugs: ['singer'],
      citySlug: 'ng-lagos',
      bio: 'Afro-soul singer. Backing vocals on two albums and a residency in Lekki.',
      version: 4,
    };
    let mediaChecks = 0;
    vi.stubGlobal('XMLHttpRequest', FakeUploadRequest);
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(),
      '/v1/taxonomy': () => Response.json(TAXONOMY),
      ...citiesRoutes,
      'GET /v1/me/talent-profile': fake.get,
      'POST /v1/media/upload-intents': () =>
        Response.json(
          {
            mediaId: AVATAR,
            upload: {
              method: 'POST',
              url: 'https://uploads.test/bucket',
              fields: { key: `pending/${USER}/${AVATAR}` },
            },
            expiresAt: '2026-10-02T09:10:00.000Z',
          },
          { status: 201 },
        ),
      [`POST /v1/media/${AVATAR}/complete`]: () =>
        Response.json(
          {
            id: AVATAR,
            purpose: 'avatar',
            kind: 'image',
            status: 'processing',
            urls: null,
            video: null,
            rejectionReason: null,
            createdAt: '2026-10-02T09:00:00.000Z',
          },
          { status: 202 },
        ),
      [`GET /v1/media/${AVATAR}`]: () => {
        mediaChecks += 1;
        // The worker attaches an approved avatar to the profile shortly after.
        if (mediaChecks > 1 && fake.profile) fake.profile['avatarMediaId'] = AVATAR;
        return Response.json({
          id: AVATAR,
          purpose: 'avatar',
          kind: 'image',
          status: mediaChecks > 1 ? 'ready' : 'scanning',
          urls: null,
          video: null,
          rejectionReason: null,
          createdAt: '2026-10-02T09:00:00.000Z',
        });
      },
      'GET /v1/me': () => Response.json(meFor({ status: 'active' })),
    });
    renderAt('/onboarding/talent/photo');
    const user = userEvent.setup({ delay: null });
    const input = await screen.findByLabelText('Choose a photo');
    await user.upload(input, new File(['jpeg-bytes'], 'ngozi.jpg', { type: 'image/jpeg' }));

    expect(await screen.findByText(/Checking your photo/)).toBeVisible();
    expect(
      await screen.findByText(
        'Your profile is complete. Agents can find you now.',
        {},
        { timeout: 10_000 },
      ),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Add to your portfolio' })).toHaveAttribute(
      'href',
      '/portfolio',
    );
    expect(FakeUploadRequest.sent[0]).toMatchObject({
      method: 'POST',
      url: 'https://uploads.test/bucket',
    });
    const intent = calls.find((call) => call.path === '/v1/media/upload-intents');
    expect(intent?.body).toEqual({ purpose: 'avatar', contentType: 'image/jpeg', bytes: 10 });
    await waitFor(() => {
      expect(calls.some((call) => call.method === 'GET' && call.path === '/v1/me')).toBe(true);
    });
  });

  it('lets the talent carry on while a moderator checks the photo (ADR-044)', async () => {
    const fake = new FakeTalentProfile();
    fake.profile = {
      userId: USER,
      handle: 'ngozi.adeyemi',
      displayName: 'Ngozi Adeyemi',
      categorySlug: 'music',
      subcategorySlugs: ['singer'],
      citySlug: 'ng-lagos',
      bio: 'Afro-soul singer. Backing vocals on two albums and a residency in Lekki.',
      version: 4,
    };
    let meChecks = 0;
    vi.stubGlobal('XMLHttpRequest', FakeUploadRequest);
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(),
      '/v1/taxonomy': () => Response.json(TAXONOMY),
      ...citiesRoutes,
      'GET /v1/me/talent-profile': fake.get,
      'POST /v1/media/upload-intents': () =>
        Response.json(
          {
            mediaId: AVATAR,
            upload: { method: 'POST', url: 'https://uploads.test/bucket', fields: {} },
            expiresAt: '2026-10-02T09:10:00.000Z',
          },
          { status: 201 },
        ),
      [`POST /v1/media/${AVATAR}/complete`]: () =>
        Response.json(
          {
            id: AVATAR,
            purpose: 'avatar',
            kind: 'image',
            status: 'processing',
            urls: null,
            video: null,
            rejectionReason: null,
            createdAt: '2026-10-02T09:00:00.000Z',
          },
          { status: 202 },
        ),
      [`GET /v1/media/${AVATAR}`]: () =>
        Response.json({
          id: AVATAR,
          purpose: 'avatar',
          kind: 'image',
          status: 'held_for_review',
          urls: null,
          video: null,
          rejectionReason: null,
          createdAt: '2026-10-02T09:00:00.000Z',
        }),
      // The worker finishes onboarding a moment after the photo is held.
      'GET /v1/me': () => {
        meChecks += 1;
        return Response.json(meFor({ status: meChecks > 1 ? 'active' : 'onboarding' }));
      },
    });
    const router = renderAt('/onboarding/talent/photo');
    const user = userEvent.setup({ delay: null });
    await user.upload(
      await screen.findByLabelText('Choose a photo'),
      new File(['jpeg-bytes'], 'ngozi.jpg', { type: 'image/jpeg' }),
    );
    expect(
      await screen.findByText('Your photo is with a moderator', {}, { timeout: 10_000 }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Continue to Raising Talents' }));
    await waitFor(
      () => {
        expect(router.state.location.pathname).toBe('/home');
      },
      { timeout: 10_000 },
    );
    expect(meChecks).toBeGreaterThan(1);
  });

  it('refuses a video for the profile photo before uploading anything', async () => {
    const fake = new FakeTalentProfile();
    fake.profile = { userId: USER, handle: 'ngozi.adeyemi', displayName: 'Ngozi', version: 1 };
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(),
      '/v1/taxonomy': () => Response.json(TAXONOMY),
      ...citiesRoutes,
      'GET /v1/me/talent-profile': fake.get,
    });
    renderAt('/onboarding/talent/photo');
    const user = userEvent.setup({ delay: null, applyAccept: false });
    await user.upload(
      await screen.findByLabelText('Choose a photo'),
      new File(['mp4'], 'clip.mp4', { type: 'video/mp4' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Use a photo in JPEG, PNG, WebP or HEIC format.',
    );
    expect(calls.some((call) => call.path === '/v1/media/upload-intents')).toBe(false);
  });
});

describe('agent onboarding', () => {
  beforeEach(resetSession);

  it('saves the agency profile in one form, then explains verification', async () => {
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(meFor({ role: 'agent' })),
      '/v1/taxonomy': () => Response.json(TAXONOMY),
      ...citiesRoutes,
      'GET /v1/me/agent-profile': () => problem(404, 'NOT_FOUND'),
      'PATCH /v1/me/agent-profile': () =>
        Response.json({
          userId: USER,
          agencyName: 'Eko Talent Partners',
          jobTitle: 'Talent scout',
          specializations: [{ slug: 'music', name: 'Music' }],
          city: { slug: 'ng-lagos', name: 'Lagos', countryCode: 'NG' },
          website: null,
          verified: false,
          isComplete: true,
          missing: [],
          version: 1,
          updatedAt: '2026-10-02T09:00:00.000Z',
        }),
      'GET /v1/me': () => Response.json(meFor({ role: 'agent', status: 'active' })),
    });
    renderAt('/home');
    const user = userEvent.setup({ delay: null });
    await user.type(await screen.findByLabelText('Agency or company'), 'Eko Talent Partners');
    await user.type(screen.getByLabelText('Your role'), 'Talent scout');
    await user.click(screen.getByRole('checkbox', { name: 'Music' }));
    await user.type(screen.getByRole('combobox', { name: 'Country' }), 'naija');
    await user.click(await screen.findByRole('option', { name: 'Nigeria' }));
    await user.click(screen.getByRole('combobox', { name: 'City' }));
    await user.click(await screen.findByRole('option', { name: 'Lagos' }));
    await user.type(screen.getByLabelText('Website (optional)'), 'eko-talent.example');
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(screen.getByLabelText('Website (optional)')).toHaveAccessibleDescription(
      /Use a full address starting with https:\/\//,
    );
    await user.clear(screen.getByLabelText('Website (optional)'));
    await expectNoAxeViolations();
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    expect(await screen.findByText(/We verify every agent/)).toBeVisible();
    const patch = calls.find((call) => call.method === 'PATCH');
    expect(patch?.body).toEqual({
      agencyName: 'Eko Talent Partners',
      jobTitle: 'Talent scout',
      specializationSlugs: ['music'],
      citySlug: 'ng-lagos',
      website: null,
    });
    const main = screen.getByRole('main');
    expect(within(main).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/home');
  });
});
