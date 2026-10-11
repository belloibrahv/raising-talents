import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  cardFor,
  expectNoAxeViolations,
  meFor,
  postFor,
  renderAt,
  resetSession,
  signedIn,
  socialFor,
  stubApi,
  TAXONOMY,
} from '../../test/app-harness';

const AVATAR = '0192a3b4-0000-7000-8000-0000000002aa';
const POST_MEDIA = '0192a3b4-0000-7000-8000-000000000101';

const asModerator = () =>
  stubApi({
    '/v1/auth/web/refresh': () => signedIn(meFor({ role: 'moderator', status: 'active' })),
    'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
    'GET /v1/taxonomy': () => Response.json(TAXONOMY),
    'GET /v1/talents/tobi.sprint': () =>
      Response.json({
        handle: 'tobi.sprint',
        displayName: 'Tobi Adebayo',
        bio: 'Sprinter from Surulere.',
        category: { slug: 'sports', name: 'Sports' },
        subcategories: [{ slug: 'athletics', name: 'Athletics' }],
        skills: [],
        city: { slug: 'ng-lagos', name: 'Lagos', countryCode: 'NG' },
        ageYears: 22,
        gender: null,
        verified: false,
        avatarMediaId: AVATAR,
        avatarUrls: null,
      }),
    'GET /v1/talents/tobi.sprint/social': () => Response.json(socialFor({ posts: 1 })),
    'GET /v1/talents/tobi.sprint/posts': () =>
      Response.json({
        items: [postFor(1, { talent: cardFor('tobi.sprint', 'Tobi Adebayo') })],
        nextCursor: null,
      }),
    [`POST /v1/moderation/media/${AVATAR}/removal`]: () => new Response(null, { status: 204 }),
    [`POST /v1/moderation/media/${POST_MEDIA}/removal`]: () => new Response(null, { status: 204 }),
  });

describe('taking down what is already live', () => {
  beforeEach(resetSession);

  it('lets a moderator remove a profile photo for a stated reason', async () => {
    const calls = asModerator();
    renderAt('/talents/tobi.sprint');
    const user = userEvent.setup({ delay: null });
    await user.click(
      await screen.findByRole('button', { name: "Remove Tobi Adebayo's profile photo" }),
    );
    const confirm = screen.getByRole('button', { name: 'Remove for this reason' });
    expect(confirm).toBeDisabled();
    await expectNoAxeViolations();
    await user.selectOptions(screen.getByLabelText('Reason'), 'Nudity or sexual content');
    await user.click(confirm);
    expect(
      await screen.findByText(
        'Removed. The profile is hidden until the owner adds a new photo, and they are told why.',
      ),
    ).toBeVisible();
    expect(calls.find((call) => call.path.endsWith('/removal'))).toMatchObject({
      path: `/v1/moderation/media/${AVATAR}/removal`,
      body: { category: 'sexual' },
    });
  });

  it('lets a moderator remove a post from the post itself', async () => {
    const calls = asModerator();
    renderAt('/talents/tobi.sprint');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: /Post 1/ }));
    const post = await screen.findByRole('article', { name: 'Post by Tobi Adebayo' });
    await user.click(within(post).getByRole('button', { name: "Remove Tobi Adebayo's post" }));
    await user.selectOptions(within(post).getByLabelText('Reason'), 'Graphic violence');
    await user.click(within(post).getByRole('button', { name: 'Remove for this reason' }));
    expect(await within(post).findByRole('status')).toHaveTextContent(
      'Removed. The owner is told why.',
    );
    expect(calls.find((call) => call.path.endsWith('/removal'))?.body).toEqual({
      category: 'violence',
    });
  });
});
