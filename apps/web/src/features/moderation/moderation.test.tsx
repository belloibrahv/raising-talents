import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  expectNoAxeViolations,
  meFor,
  renderAt,
  resetSession,
  signedIn,
  stubApi,
} from '../../test/app-harness';

const moderator = meFor({ role: 'moderator', status: 'active' });
const ids = [
  '0192a3b4-0000-7000-8000-0000000000c1',
  '0192a3b4-0000-7000-8000-0000000000c2',
] as const;
const owner = '0192a3b4-0000-7000-8000-0000000000d1';

const held = (id: string) => ({
  id,
  ownerId: owner,
  purpose: 'avatar',
  kind: 'image',
  labels: [{ name: 'Swimwear or Underwear', parentName: null, confidence: 64.2 }],
  urls: {
    small: `https://media.test/${id}/256.webp`,
    medium: `https://media.test/${id}/1024.webp`,
    large: `https://media.test/${id}/2048.webp`,
  },
  video: null,
  heldAt: '2026-10-02T09:00:00.000Z',
});

describe('moderation', () => {
  beforeEach(resetSession);

  it('takes staff straight to the queue, with labels and a preview, and passes axe', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(moderator),
      'GET /v1/moderation/media': () => Response.json({ items: [held(ids[0])], nextCursor: null }),
    });
    const router = renderAt('/home');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Moderation queue' }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/moderation');
    const item = await screen.findByRole('article');
    expect(within(item).getByText('Swimwear or Underwear: 64%')).toBeVisible();
    expect(within(item).getByRole('img')).toHaveAttribute(
      'src',
      `https://media.test/${ids[0]}/1024.webp`,
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', {
        name: 'Moderation',
      }),
    ).toBeVisible();
    await expectNoAxeViolations();
  });

  it('approves, and rejects only with a reason, then refreshes the queue', async () => {
    let queue = [held(ids[0]), held(ids[1])];
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(moderator),
      'GET /v1/moderation/media': () => Response.json({ items: queue, nextCursor: null }),
      [`POST /v1/moderation/media/${ids[0]}/decision`]: () => {
        queue = queue.filter((entry) => entry.id !== ids[0]);
        return new Response(null, { status: 204 });
      },
      [`POST /v1/moderation/media/${ids[1]}/decision`]: () => {
        queue = queue.filter((entry) => entry.id !== ids[1]);
        return new Response(null, { status: 204 });
      },
    });
    renderAt('/moderation');
    const user = userEvent.setup({ delay: null });
    const [first] = await screen.findAllByRole('article');
    await user.click(within(first as HTMLElement).getByRole('button', { name: 'Approve' }));
    expect(await screen.findByText('Approved. The owner can use it now.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByRole('article')).toHaveLength(1);
    });

    const second = screen.getByRole('article');
    await user.click(within(second).getByRole('button', { name: 'Reject' }));
    const confirm = within(second).getByRole('button', { name: 'Reject for this reason' });
    expect(confirm).toBeDisabled();
    await user.selectOptions(within(second).getByLabelText('Reason'), 'hate');
    await user.click(confirm);
    expect(await screen.findByText('Nothing is waiting. Good work.')).toBeVisible();

    const decisions = calls
      .filter((call) => call.path.endsWith('/decision'))
      .map((call) => call.body);
    expect(decisions).toEqual([{ decision: 'approve' }, { decision: 'reject', category: 'hate' }]);
  });
});
