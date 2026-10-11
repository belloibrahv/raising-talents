import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  expectNoAxeViolations,
  feedRoutes,
  meFor,
  postFor,
  problem,
  renderAt,
  resetSession,
  signedIn,
  stubApi,
  TAXONOMY,
} from '../../test/app-harness';

const POST = '0192a3b4-0000-7000-8000-000000000001';
const COMMENTS = `/v1/posts/${POST}/comments`;

const commentFor = (n: number, overrides: Record<string, unknown> = {}) => ({
  id: `0192a3b4-0000-7000-8000-0000000009${String(n).padStart(2, '0')}`,
  body: `Comment ${String(n)}`,
  postedAt: '2026-10-02T09:30:00.000Z',
  author: {
    name: 'Zainab Bello',
    handle: 'zainab.bello',
    agentId: null,
    avatarUrls: null,
    verified: false,
  },
  mine: false,
  canDelete: false,
  ...overrides,
});

const agency = {
  name: 'Eko Talent Partners',
  handle: null,
  agentId: '0192a3b4-0000-7000-8000-0000000000aa',
  avatarUrls: null,
  verified: true,
};

const as = (role: 'talent' | 'agent' | 'moderator', extra: Parameters<typeof stubApi>[0] = {}) =>
  stubApi({
    '/v1/auth/web/refresh': () => signedIn(meFor({ role, status: 'active' })),
    'GET /v1/me/notifications/unread': () => Response.json({ unread: 0 }),
    'GET /v1/me/conversations/unread': () => Response.json({ unread: 0 }),
    'GET /v1/me/conversations': () => Response.json({ items: [], nextCursor: null }),
    'GET /v1/me/agent-profile': () => problem(404, 'NOT_FOUND'),
    'GET /v1/taxonomy': () => Response.json(TAXONOMY),
    ...feedRoutes([postFor(1, { comments: 2 })]),
    [`GET /v1/posts/${POST}`]: () => Response.json(postFor(1, { comments: 2 })),
    [`GET ${COMMENTS}`]: () =>
      Response.json({
        items: [
          commentFor(2, { body: 'We should talk after the trials.', author: agency }),
          commentFor(1, { body: 'Flying start!' }),
        ],
        nextCursor: null,
        total: 2,
      }),
    ...extra,
  });

const openPost = async () => {
  const [post] = await screen.findAllByRole('article', { name: 'Post by Tobi Adebayo' });
  if (!post) throw new Error('no post');
  return post;
};

describe('comments', () => {
  beforeEach(resetSession);

  it('keeps comments folded in the feed and opens them when asked', async () => {
    const calls = as('agent');
    renderAt('/home');
    const user = userEvent.setup({ delay: null });
    const post = await openPost();
    const toggle = within(post).getByRole('button', { name: "Comments on Tobi Adebayo's post" });
    expect(toggle).toHaveTextContent('2 comments');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(calls.some((call) => call.path === COMMENTS)).toBe(false);

    await user.click(toggle);
    const first = await within(post).findByRole('article', {
      name: 'Comment by Eko Talent Partners',
    });
    expect(within(first).getByText('We should talk after the trials.')).toBeVisible();
    expect(within(first).getByRole('link', { name: /Eko Talent Partners/ })).toHaveAttribute(
      'href',
      `/agents/${agency.agentId}`,
    );
    const second = within(post).getByRole('article', { name: 'Comment by Zainab Bello' });
    expect(within(second).getByRole('link', { name: 'Zainab Bello' })).toHaveAttribute(
      'href',
      '/talents/zainab.bello',
    );
    // Someone else's comment can be reported, not deleted.
    expect(within(second).getByRole('button', { name: 'Report' })).toBeVisible();
    expect(within(second).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    await expectNoAxeViolations();
  });

  it('adds a comment at the top and counts it on the post', async () => {
    const calls = as('agent', {
      [`POST ${COMMENTS}`]: (call) =>
        Response.json(
          commentFor(3, {
            body: (call.body as { body: string }).body,
            author: agency,
            mine: true,
            canDelete: true,
          }),
          { status: 201 },
        ),
    });
    renderAt(`/posts/${POST}`);
    const user = userEvent.setup({ delay: null });
    const post = await openPost();
    // On the post's own page the comments are already open.
    const field = await within(post).findByRole('textbox', {
      name: "Comment on Tobi Adebayo's post",
    });
    const send = within(post).getByRole('button', { name: 'Post comment' });
    expect(send).toBeDisabled();
    await user.type(field, '  Strong finish.  ');
    await user.click(send);

    const added = await within(post).findByText('Strong finish.');
    const mine = added.closest('article');
    if (!mine) throw new Error('no comment');
    expect(mine).toHaveAccessibleName('Comment by Eko Talent Partners');
    expect(field).toHaveValue('');
    expect(await within(post).findByText('3 comments')).toBeVisible();
    expect(calls.find((call) => call.method === 'POST' && call.path === COMMENTS)?.body).toEqual({
      body: 'Strong finish.',
    });
    // Nobody reports their own comment.
    expect(within(mine).queryByRole('button', { name: 'Report' })).not.toBeInTheDocument();
  });

  it('deletes a comment after asking once', async () => {
    const calls = as('agent', {
      [`GET ${COMMENTS}`]: () =>
        Response.json({
          items: [commentFor(2, { author: agency, mine: true, canDelete: true }), commentFor(1)],
          nextCursor: null,
          total: 2,
        }),
      'DELETE /v1/comments/0192a3b4-0000-7000-8000-000000000902': () =>
        new Response(null, { status: 204 }),
    });
    renderAt(`/posts/${POST}`);
    const user = userEvent.setup({ delay: null });
    const post = await openPost();
    const mine = await within(post).findByRole('article', {
      name: 'Comment by Eko Talent Partners',
    });
    await user.click(within(mine).getByRole('button', { name: 'Delete' }));
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    const confirm = within(mine).getByRole('group', { name: 'Delete this comment?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete' }));
    await waitFor(() => {
      expect(
        within(post).queryByRole('article', { name: 'Comment by Eko Talent Partners' }),
      ).not.toBeInTheDocument();
    });
    expect(await within(post).findByText('1 comment')).toBeVisible();
  });

  it('reports a comment to the moderators', async () => {
    const calls = as('agent', {
      'POST /v1/reports': () => new Response(null, { status: 204 }),
    });
    renderAt(`/posts/${POST}`);
    const user = userEvent.setup({ delay: null });
    const post = await openPost();
    const theirs = await within(post).findByRole('article', { name: 'Comment by Zainab Bello' });
    await user.click(within(theirs).getByRole('button', { name: 'Report' }));
    await user.click(within(theirs).getByRole('radio', { name: /scam|harass/i }));
    await user.click(within(theirs).getByRole('button', { name: 'Send report' }));
    expect(
      await within(theirs).findByText('Thank you. A moderator will read this comment.'),
    ).toBeVisible();
    expect(calls.find((call) => call.path === '/v1/reports')?.body).toEqual({
      subject: { kind: 'comment', commentId: '0192a3b4-0000-7000-8000-000000000901' },
      category: 'scam_or_harassment',
    });
  });

  it('lets a moderator delete any comment, without a field to write in', async () => {
    as('moderator', {
      [`GET ${COMMENTS}`]: () =>
        Response.json({
          items: [commentFor(1, { canDelete: true })],
          nextCursor: null,
          total: 1,
        }),
    });
    renderAt(`/posts/${POST}`);
    const post = await openPost();
    const comment = await within(post).findByRole('article', { name: 'Comment by Zainab Bello' });
    expect(within(comment).getByRole('button', { name: 'Delete' })).toBeVisible();
    expect(within(comment).queryByRole('button', { name: 'Report' })).not.toBeInTheDocument();
    expect(within(post).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('says so when the post is gone', async () => {
    as('agent', { [`GET /v1/posts/${POST}`]: () => problem(404, 'NOT_FOUND') });
    renderAt(`/posts/${POST}`);
    expect(await screen.findByText('This post was removed or is no longer visible.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/home');
  });
});
