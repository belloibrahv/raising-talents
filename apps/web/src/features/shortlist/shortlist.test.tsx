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
} from '../../test/app-harness';

const agent = meFor({ role: 'agent', status: 'active' });

const card = {
  handle: 'ada.sings',
  displayName: 'Ada Nwosu',
  category: { slug: 'music', name: 'Music' },
  subcategories: [{ slug: 'singer', name: 'Singer' }],
  city: { slug: 'ng-lagos', name: 'Lagos', countryCode: 'NG' },
  ageYears: 24,
  verified: true,
  avatarUrls: null,
};
const profile = {
  ...card,
  bio: 'Soul singer from Yaba.',
  skills: [],
  gender: null,
  avatarMediaId: null,
};
const entry = (note: string) => ({
  talent: card,
  note,
  savedAt: '2026-10-02T09:00:00.000Z',
  updatedAt: '2026-10-02T09:00:00.000Z',
});

describe('shortlist', () => {
  beforeEach(resetSession);

  it('saves from the profile, then removes with a second press', async () => {
    let saved: ReturnType<typeof entry> | null = null;
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      'GET /v1/talents/ada.sings': () => Response.json(profile),
      'GET /v1/talents/ada.sings/portfolio': () => Response.json({ items: [] }),
      'GET /v1/me/shortlist/ada.sings': () =>
        saved ? Response.json(saved) : problem(404, 'NOT_FOUND'),
      'PUT /v1/me/shortlist/ada.sings': () => {
        saved = entry('');
        return Response.json(saved);
      },
      'DELETE /v1/me/shortlist/ada.sings': () => {
        saved = null;
        return new Response(null, { status: 204 });
      },
    });
    renderAt('/talents/ada.sings');
    const user = userEvent.setup({ delay: null });
    const saveButton = await screen.findByRole('button', { name: 'Save to shortlist' });
    // Disabled until the app knows whether this talent is already saved.
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
    await user.click(saveButton);
    const remove = await screen.findByRole('button', {
      name: 'Saved. Press to remove Ada Nwosu from your shortlist',
    });
    expect(
      calls.find((call) => call.path === '/v1/me/shortlist/ada.sings' && call.method === 'PUT')
        ?.body,
    ).toEqual({});
    await expectNoAxeViolations();
    await user.click(remove);
    expect(await screen.findByRole('button', { name: 'Save to shortlist' })).toBeVisible();
  });

  it('lists saved talent with private notes, saves a note and removes', async () => {
    let items = [entry('Strong live vocals')];
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      'GET /v1/me/shortlist': () =>
        Response.json({ items, saved: items.length, max: 500, nextCursor: null }),
      'PUT /v1/me/shortlist/ada.sings': (call) => {
        items = [entry((call.body as { note: string }).note)];
        return Response.json(items[0]);
      },
      'DELETE /v1/me/shortlist/ada.sings': () => {
        items = [];
        return new Response(null, { status: 204 });
      },
    });
    renderAt('/shortlist');
    const user = userEvent.setup({ delay: null });
    const article = await screen.findByRole('article', { name: /Ada Nwosu/ });
    expect(screen.getByText('1 of 500 saved')).toBeVisible();
    expect(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
        name: 'Shortlist',
      }),
    ).toHaveAttribute('aria-current', 'page');
    expect(within(article).getByText('Strong live vocals')).toBeVisible();
    await expectNoAxeViolations();

    await user.click(
      within(article).getByRole('button', { name: 'Edit your note about Ada Nwosu' }),
    );
    const note = within(article).getByLabelText('Private note about Ada Nwosu');
    expect(note).toHaveValue('Strong live vocals');

    await user.clear(note);
    await user.type(note, 'Call after the showcase');
    await user.click(within(article).getByRole('button', { name: 'Save note' }));
    await waitFor(() => {
      expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
        note: 'Call after the showcase',
      });
    });

    await user.click(
      within(article).getByRole('button', { name: 'Remove Ada Nwosu from your shortlist' }),
    );
    expect(await screen.findByText('Nobody saved yet')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Find talent' })).toHaveAttribute('href', '/search');
  });

  it('says saved talent are hidden, not that nothing was saved', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      'GET /v1/me/shortlist': () =>
        Response.json({ items: [], saved: 2, max: 500, nextCursor: null }),
    });
    renderAt('/shortlist');
    expect(await screen.findByText('Your saved talent are hidden right now')).toBeVisible();
    expect(screen.queryByText('Nobody saved yet')).toBeNull();
  });
});
