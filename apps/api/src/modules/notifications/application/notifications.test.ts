import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import type { EmailMessage } from '../../../platform/email/email-sender.js';
import { FixedClock } from '../../../platform/testing/fakes.js';
import { InMemoryInbox } from '../testing/in-memory-inbox.js';
import { InMemoryNotificationLog } from '../testing/in-memory-notification-log.js';
import { mediaRejectedEmail } from './emails.js';
import {
  Notifier,
  type NotificationMedia,
  type NotificationVerifications,
} from './notifications.js';

const OWNER = 'owner-1';
const AGENT = 'agent-1';

type File =
  Awaited<ReturnType<NotificationMedia['describe']>> extends Map<string, infer F> ? F : never;

describe('Notifier', () => {
  let sent: EmailMessage[];
  let files: Map<string, File>;
  let outcomes: Map<string, { agentId: string; status: string; declineReason: string | null }>;
  let notifier: Notifier;
  let inbox: InMemoryInbox;
  const clock = new FixedClock();

  const event = (type: string, aggregateId: string) => ({
    type,
    aggregateId,
    occurredAt: clock.now(),
    payload: {},
  });

  beforeEach(() => {
    sent = [];
    inbox = new InMemoryInbox();
    files = new Map();
    outcomes = new Map();
    const media: NotificationMedia = {
      describe: async (ids) =>
        new Map(ids.flatMap((id) => (files.has(id) ? [[id, files.get(id) as File]] : []))),
    };
    const verifications: NotificationVerifications = {
      outcome: async (id) => outcomes.get(id) ?? null,
    };
    notifier = new Notifier(
      { send: async (message) => void sent.push(message) },
      new InMemoryNotificationLog(),
      inbox,
      {
        findSummaryById: async (id) =>
          ({
            [OWNER]: { email: 'amaka.okafor@example.com' },
            [AGENT]: { email: 'tunde@eko-talent.example' },
          })[id] ?? null,
      },
      media,
      verifications,
      'https://app.raisingtalents.test',
      'support@raisingtalents.test',
      clock,
      pino({ level: 'silent' }),
    );
  });

  it('tells the owner once when a moderator approves held media, even if the event arrives twice', async () => {
    files.set('m1', {
      ownerId: OWNER,
      purpose: 'avatar',
      kind: 'image',
      status: 'ready',
      rejectionReason: null,
      reviewed: true,
    });
    await notifier.mediaDecided(event('media.MediaReady', 'm1'));
    await notifier.mediaDecided(event('media.MediaReady', 'm1'));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: 'amaka.okafor@example.com',
      subject: 'Your profile photo is approved',
    });
    expect(sent[0]?.text).toContain('https://app.raisingtalents.test/home');
  });

  it('sends the reason when held media is rejected, and nothing for instant scan results', async () => {
    files.set('m2', {
      ownerId: OWNER,
      purpose: 'portfolio',
      kind: 'video',
      status: 'rejected',
      rejectionReason: 'This video breaks the Community Guidelines, so it cannot be shown.',
      reviewed: true,
    });
    files.set('m3', {
      ownerId: OWNER,
      purpose: 'portfolio',
      kind: 'image',
      status: 'ready',
      rejectionReason: null,
      reviewed: false,
    });
    await notifier.mediaDecided(event('media.MediaRejected', 'm2'));
    await notifier.mediaDecided(event('media.MediaReady', 'm3'));
    expect(sent.map((message) => message.subject)).toEqual([
      'Your portfolio video was not approved',
    ]);
    expect(sent[0]?.text).toContain('This video breaks the Community Guidelines');
  });

  it('tells agents the verification outcome, with the reason when declined', async () => {
    outcomes.set('r1', { agentId: AGENT, status: 'approved', declineReason: null });
    outcomes.set('r2', {
      agentId: AGENT,
      status: 'declined',
      declineReason: 'We could not open the page you sent.',
    });
    await notifier.verificationDecided(event('agent.VerificationApproved', 'r1'));
    await notifier.verificationDecided(event('agent.VerificationDeclined', 'r2'));
    expect(sent.map((message) => [message.to, message.subject])).toEqual([
      ['tunde@eko-talent.example', 'Your agency is verified'],
      ['tunde@eko-talent.example', 'We could not verify your agency yet'],
    ]);
    expect(sent[1]?.html).toContain('https://app.raisingtalents.test/verification');
  });

  it('tells a restricted member why and how to appeal, and when they are back', async () => {
    const restricted = (type: string, reason: string) => ({
      ...event(type, OWNER),
      payload: { reason },
    });
    await notifier.accountRestricted(
      restricted('accounts.AccountSuspended', 'scam_or_harassment'),
      'suspend',
    );
    await notifier.accountRestricted(restricted('accounts.AccountBanned', 'not-a-reason'), 'ban');
    clock.advanceSeconds(1);
    await notifier.accountReinstated(event('accounts.AccountReinstated', OWNER));
    expect(sent.map((message) => message.subject)).toEqual([
      'Your Raising Talents account is suspended',
      'Your Raising Talents account is back',
    ]);
    expect(sent[0]?.text).toContain('ask people for money');
    expect(sent[0]?.html).toContain('mailto:support@raisingtalents.test?subject=Appeal');
  });

  it('escapes anything inserted into the HTML', () => {
    const message = mediaRejectedEmail({
      to: 'x@example.com',
      kind: 'image',
      purpose: 'portfolio',
      reason: 'Reason with <script>alert(1)</script> & "quotes"',
      appUrl: 'https://app.raisingtalents.test',
    });
    expect(message.html).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quotes&quot;',
    );
    expect(message.html).not.toContain('<script>');
  });

  it('puts each decision in the inbox once, even when the event arrives twice', async () => {
    files.set('m1', {
      ownerId: OWNER,
      kind: 'image',
      purpose: 'portfolio',
      status: 'rejected',
      reviewed: true,
      rejectionReason: 'This image breaks the Community Guidelines, so it cannot be shown.',
    });
    const rejected = event('media.MediaRejected', 'm1');
    await notifier.mediaDecided(rejected);
    await notifier.mediaDecided(rejected);
    expect(inbox.entries.map((entry) => [entry.userId, entry.content])).toEqual([
      [
        OWNER,
        {
          kind: 'media_rejected',
          mediaKind: 'image',
          purpose: 'portfolio',
          reason: 'This image breaks the Community Guidelines, so it cannot be shown.',
        },
      ],
    ]);
    expect(sent).toHaveLength(1);
  });

  it('keeps restrictions out of the inbox, and notes password changes without an email', async () => {
    await notifier.accountRestricted(
      { ...event('accounts.AccountSuspended', OWNER), payload: { reason: 'other' } },
      'suspend',
    );
    await notifier.passwordChanged(event('identity.PasswordChanged', OWNER));
    expect(inbox.entries.map((entry) => entry.content.kind)).toEqual(['password_changed']);
    expect(sent.map((message) => message.subject)).toEqual([
      'Your Raising Talents account is suspended',
    ]);
  });
});
