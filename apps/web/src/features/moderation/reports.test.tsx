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

const agent = meFor({ role: 'agent', status: 'active' });
const moderator = meFor({ role: 'moderator', status: 'active' });
const accountId = '0192a3b4-0000-7000-8000-0000000000e1';

const profile = {
  handle: 'dayo.guitar',
  displayName: 'Dayo Ajayi',
  bio: 'Highlife guitarist from Ibadan.',
  category: { slug: 'music', name: 'Music' },
  subcategories: [{ slug: 'guitarist', name: 'Guitarist' }],
  skills: [],
  city: { slug: 'ng-oyo', name: 'Ibadan', countryCode: 'NG' },
  ageYears: 30,
  gender: null,
  verified: false,
  avatarMediaId: null,
  avatarUrls: null,
};

const reported = {
  accountId,
  role: 'talent',
  status: 'active',
  talent: { handle: 'dayo.guitar', displayName: 'Dayo Ajayi' },
  openReports: 3,
  categories: [
    { category: 'fake_or_impersonation', count: 2 },
    { category: 'other', count: 1 },
  ],
  notes: [
    { note: 'Photos belong to a different musician', reportedAt: '2026-10-03T09:00:00.000Z' },
  ],
  firstReportedAt: '2026-10-02T09:00:00.000Z',
  previousActions: 1,
};

describe('reporting a profile', () => {
  beforeEach(resetSession);

  it('needs a reason, sends the report, and thanks the reporter', async () => {
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(agent),
      'GET /v1/talents/dayo.guitar': () => Response.json(profile),
      'GET /v1/talents/dayo.guitar/portfolio': () => Response.json({ items: [] }),
      'POST /v1/reports': () => new Response(null, { status: 204 }),
    });
    renderAt('/talents/dayo.guitar');
    const user = userEvent.setup({ delay: null });
    await user.click(await screen.findByRole('button', { name: 'Report this profile' }));
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(await screen.findByText('Choose what is wrong.')).toBeVisible();
    expect(calls.some((call) => call.path === '/v1/reports')).toBe(false);
    await expectNoAxeViolations();

    await user.click(screen.getByLabelText('Fake, or pretending to be someone else'));
    await user.type(
      screen.getByLabelText('Anything else we should know? (optional)'),
      'Photos belong to a different musician',
    );
    await user.click(screen.getByRole('button', { name: 'Send report' }));
    expect(
      await screen.findByText('Thank you. A moderator will look at this profile.'),
    ).toBeVisible();
    expect(calls.find((call) => call.path === '/v1/reports')?.body).toEqual({
      subject: { kind: 'talent', handle: 'dayo.guitar' },
      category: 'fake_or_impersonation',
      note: 'Photos belong to a different musician',
    });
  });
});

describe('the reports queue', () => {
  beforeEach(resetSession);

  it('shows reported accounts without the reporters, and passes axe', async () => {
    stubApi({
      '/v1/auth/web/refresh': () => signedIn(moderator),
      'GET /v1/moderation/reports': () => Response.json({ items: [reported], nextCursor: null }),
    });
    renderAt('/moderation/reports');
    const card = await screen.findByRole('article', { name: 'Dayo Ajayi. Open reports: 3' });
    expect(
      within(card).getByText('Fake, or pretending to be someone else (2), Something else (1)'),
    ).toBeVisible();
    expect(within(card).getByText('Photos belong to a different musician')).toBeVisible();
    expect(within(card).getByText('Suspended or banned before: 1')).toBeVisible();
    expect(within(card).getByRole('link', { name: '@dayo.guitar' })).toHaveAttribute(
      'href',
      '/talents/dayo.guitar',
    );
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute('aria-current', 'page');
    await expectNoAxeViolations();
  });

  it('suspends with the likeliest reason chosen, then dismisses the next', async () => {
    let queue = [reported, { ...reported, accountId: `${accountId.slice(0, -1)}2`, talent: null }];
    const decide = (id: string) => () => {
      queue = queue.filter((entry) => entry.accountId !== id);
      return new Response(null, { status: 204 });
    };
    const second = queue[1]?.accountId ?? '';
    const calls = stubApi({
      '/v1/auth/web/refresh': () => signedIn(moderator),
      'GET /v1/moderation/reports': () => Response.json({ items: queue, nextCursor: null }),
      [`POST /v1/moderation/reports/${accountId}/decision`]: decide(accountId),
      [`POST /v1/moderation/reports/${second}/decision`]: decide(second),
    });
    renderAt('/moderation/reports');
    const user = userEvent.setup({ delay: null });
    const first = await screen.findByRole('article', { name: 'Dayo Ajayi. Open reports: 3' });
    await user.click(within(first).getByRole('button', { name: 'Suspend' }));
    expect(within(first).getByLabelText('Reason')).toHaveValue('fake_or_impersonation');
    await user.click(within(first).getByRole('button', { name: 'Suspend account' }));
    expect(await screen.findByText('Account suspended.')).toBeInTheDocument();
    expect(calls.find((call) => call.path.endsWith(`${accountId}/decision`))?.body).toEqual({
      decision: 'suspend',
      reason: 'fake_or_impersonation',
    });

    const next = await screen.findByRole('article', {
      name: 'Account without a public profile. Open reports: 3',
    });
    await user.click(within(next).getByRole('button', { name: 'Dismiss reports' }));
    await waitFor(() => {
      expect(screen.queryAllByRole('article')).toHaveLength(0);
    });
    expect(screen.getByText('No open reports.')).toBeVisible();
  });
});
