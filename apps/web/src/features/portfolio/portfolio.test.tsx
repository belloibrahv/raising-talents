import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  expectNoAxeViolations,
  meFor,
  problem,
  renderAt,
  resetSession,
  signedIn,
  stubApi,
  type Call,
} from '../../test/app-harness';

const urls = (id: string) => ({
  small: `https://media.test/${id}/256.webp`,
  medium: `https://media.test/${id}/1024.webp`,
  large: `https://media.test/${id}/2048.webp`,
});

const item = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  kind: 'image',
  mediaId: id.replace('-0000000000a', '-00000000a0b'),
  mediaStatus: 'ready',
  caption: '',
  urls: urls(id),
  video: null,
  rejectionReason: null,
  createdAt: '2026-10-02T09:00:00.000Z',
  ...overrides,
});

const ids = [
  '0192a3b4-0000-7000-8000-0000000000a1',
  '0192a3b4-0000-7000-8000-0000000000a2',
] as const;

/** A portfolio endpoint with versions, as the API has. */
function fakePortfolio() {
  const state = {
    version: 3,
    items: [
      item(ids[0], { caption: 'Closing look, Lagos Fashion Week' }),
      item(ids[1], {
        mediaStatus: 'rejected',
        urls: null,
        rejectionReason: 'This image looks like it shows graphic violence.',
      }),
    ],
  };
  const view = () => Response.json({ items: state.items, maxItems: 30, version: state.version });
  return {
    state,
    get: view,
    reorder: (call: Call) => {
      if (call.headers['if-match'] !== `"${String(state.version)}"`)
        return problem(412, 'PRECONDITION_FAILED');
      const order = (call.body as { itemIds: string[] }).itemIds;
      state.items = order.map(
        (id) => state.items.find((entry) => entry.id === id) as (typeof state.items)[number],
      );
      state.version += 1;
      return view();
    },
    remove: (id: string) => () => {
      state.items = state.items.filter((entry) => entry.id !== id);
      state.version += 1;
      return view();
    },
  };
}

describe('portfolio', () => {
  beforeEach(resetSession);

  it('lists items in order with their status, and explains a rejection', async () => {
    const fake = fakePortfolio();
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(meFor({ status: 'active' })),
      'GET /v1/me/portfolio': fake.get,
    });
    renderAt('/portfolio');
    const items = await screen.findAllByRole('article');
    expect(items).toHaveLength(2);
    expect(within(items[0] as HTMLElement).getByText('Live')).toBeVisible();
    expect(
      within(items[0] as HTMLElement).getByRole('img', {
        name: 'Closing look, Lagos Fashion Week',
      }),
    ).toHaveAttribute('srcset', expect.stringContaining('2048w') as string);
    expect(
      within(items[1] as HTMLElement).getByText(
        /Why: This image looks like it shows graphic violence/,
      ),
    ).toBeVisible();
    expect(screen.getByText('2 of 30 items')).toBeVisible();
    await expectNoAxeViolations();
  });

  it('moves an item with the version it read, and says where it went', async () => {
    const fake = fakePortfolio();
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(meFor({ status: 'active' })),
      'GET /v1/me/portfolio': fake.get,
      'PUT /v1/me/portfolio/order': fake.reorder,
    });
    renderAt('/portfolio');
    const user = userEvent.setup({ delay: null });
    await user.click(
      await screen.findByRole('button', { name: 'Move Closing look, Lagos Fashion Week later' }),
    );
    expect(await screen.findByText('Moved to position 2.')).toBeInTheDocument();
    const reorder = calls.find((call) => call.method === 'PUT');
    expect(reorder?.headers['if-match']).toBe('"3"');
    expect(reorder?.body).toEqual({ itemIds: [ids[1], ids[0]] });
    expect(
      screen.getByRole('button', { name: 'Move Closing look, Lagos Fashion Week later' }),
    ).toBeDisabled();
  });

  it('edits a caption in place, from the pencil on the tile', async () => {
    const fake = fakePortfolio();
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(meFor({ status: 'active' })),
      'GET /v1/me/portfolio': fake.get,
      [`PATCH /v1/me/portfolio/items/${ids[1]}`]: (call) => {
        fake.state.items = fake.state.items.map((entry) =>
          entry.id === ids[1]
            ? { ...entry, caption: (call.body as { caption: string }).caption }
            : entry,
        );
        fake.state.version += 1;
        return Response.json({
          items: fake.state.items,
          maxItems: 30,
          version: fake.state.version,
        });
      },
    });
    renderAt('/portfolio');
    const user = userEvent.setup({ delay: null });
    const second = (await screen.findAllByRole('article'))[1] as HTMLElement;
    expect(within(second).getByText('No caption yet')).toBeVisible();
    await user.click(within(second).getByRole('button', { name: 'Edit the caption of Item 2' }));
    await user.type(within(second).getByLabelText('Caption'), 'Studio session, Yaba');
    await user.click(within(second).getByRole('button', { name: 'Save caption' }));
    expect(await within(second).findByText('Studio session, Yaba')).toBeVisible();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
      caption: 'Studio session, Yaba',
    });
  });

  it('asks before removing, in the page rather than a browser dialog', async () => {
    const fake = fakePortfolio();
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(meFor({ status: 'active' })),
      'GET /v1/me/portfolio': fake.get,
      [`DELETE /v1/me/portfolio/items/${ids[1]}`]: fake.remove(ids[1]),
    });
    renderAt('/portfolio');
    const user = userEvent.setup({ delay: null });
    const second = (await screen.findAllByRole('article'))[1] as HTMLElement;
    await user.click(within(second).getByRole('button', { name: 'Remove' }));
    const confirm = within(second).getByRole('group', {
      name: 'Remove this item? Its file is deleted too.',
    });
    await user.click(within(confirm).getByRole('button', { name: 'Keep it' }));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);

    await user.click(within(second).getByRole('button', { name: 'Remove' }));
    await user.click(within(second).getByRole('button', { name: 'Yes, remove it' }));
    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(1);
    });
    expect(await screen.findByText('Item removed.')).toBeInTheDocument();
  });

  it('refuses a clip over 300 MB before asking the API for anything', async () => {
    const fake = fakePortfolio();
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(meFor({ status: 'active' })),
      'GET /v1/me/portfolio': fake.get,
    });
    renderAt('/portfolio');
    const user = userEvent.setup({ delay: null });
    const huge = new File(['x'], 'final-match.mp4', { type: 'video/mp4' });
    Object.defineProperty(huge, 'size', { value: 301 * 1024 * 1024 });
    await user.upload(await screen.findByLabelText('Add a photo or video'), huge);
    expect(await screen.findByRole('alert')).toHaveTextContent('That video is over 300 MB.');
    expect(calls.some((call) => call.path === '/v1/media/upload-intents')).toBe(false);
  });
});

describe('a talent profile as agents see it', () => {
  beforeEach(resetSession);

  it('shows the profile, ready images and videos, and never the date of birth', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(meFor({ role: 'agent', status: 'active' })),
      'GET /v1/talents/ngozi.adeyemi': () =>
        Response.json({
          handle: 'ngozi.adeyemi',
          displayName: 'Ngozi Adeyemi',
          bio: 'Afro-soul singer from Lekki.',
          category: { slug: 'music', name: 'Music' },
          subcategories: [{ slug: 'singer', name: 'Singer' }],
          skills: [{ slug: 'vocals', name: 'Vocals' }],
          city: { slug: 'ng-lagos', name: 'Lagos', countryCode: 'NG' },
          ageYears: 26,
          gender: null,
          verified: false,
          avatarMediaId: null,
          avatarUrls: null,
        }),
      'GET /v1/talents/ngozi.adeyemi/portfolio': () =>
        Response.json({
          items: [
            { id: ids[0], kind: 'image', caption: 'Live at Hard Rock Lagos', urls: urls(ids[0]) },
            {
              id: ids[1],
              kind: 'video',
              caption: '',
              video: {
                streamUrl: 'https://stream.video.test/play.m3u8?token=signed',
                posterUrl: 'https://image.video.test/play/thumbnail.webp?token=signed',
                durationSeconds: 41,
                expiresAt: '2026-10-02T15:00:00.000Z',
              },
            },
          ],
        }),
    });
    renderAt('/talents/ngozi.adeyemi');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ngozi Adeyemi' })).toBeVisible();
    for (const fact of ['Singer', 'Lagos, Nigeria', '26 years old']) {
      expect(screen.getByText(fact)).toBeVisible();
    }
    const photo = await screen.findByRole('img', { name: 'Photo 1 by Ngozi Adeyemi' });
    expect(photo.closest('figure')?.querySelector('figcaption')).toHaveTextContent(
      'Live at Hard Rock Lagos',
    );
    expect(document.querySelector('video')).toHaveAttribute(
      'poster',
      'https://image.video.test/play/thumbnail.webp?token=signed',
    );
    expect(document.title).toBe('Ngozi Adeyemi on Raising Talents | Raising Talents');
    await expectNoAxeViolations();
  });

  it('answers an unavailable profile without saying why', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(meFor({ role: 'agent', status: 'active' })),
      'GET /v1/talents/someone.hidden': () => problem(404, 'NOT_FOUND'),
    });
    renderAt('/talents/someone.hidden');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'This profile is not available.' }),
    ).toBeVisible();
  });
});
