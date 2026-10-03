import type { ReportCategory } from '@rt/contracts';
import type { EmailMessage } from '../../../platform/email/email-sender.js';

/** Plain, branded emails: one message, one link, no tracking. */
function email(input: {
  to: string;
  subject: string;
  paragraphs: readonly string[];
  link: { href: string; label: string };
}): EmailMessage {
  const escape = (value: string) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  const text = [
    ...input.paragraphs,
    '',
    `${input.link.label}: ${input.link.href}`,
    '',
    'Raising Talents',
  ].join('\n\n');
  const html = `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #1C1A3D; line-height: 1.5;">
${input.paragraphs.map((paragraph) => `    <p>${escape(paragraph)}</p>`).join('\n')}
    <p><a href="${escape(input.link.href)}" style="color: #1C1A3D; font-weight: bold;">${escape(input.link.label)}</a></p>
    <p style="color: #5E5B78;">Raising Talents</p>
  </body>
</html>`;
  return { to: input.to, subject: input.subject, text, html };
}

const fileName = (kind: 'image' | 'video', purpose: 'avatar' | 'portfolio') =>
  purpose === 'avatar' ? 'profile photo' : kind === 'video' ? 'portfolio video' : 'portfolio photo';

export function mediaApprovedEmail(input: {
  to: string;
  kind: 'image' | 'video';
  purpose: 'avatar' | 'portfolio';
  appUrl: string;
}): EmailMessage {
  const name = fileName(input.kind, input.purpose);
  return email({
    to: input.to,
    subject: `Your ${name} is approved`,
    paragraphs: [
      `A moderator checked your ${name} and approved it. It is now on your profile for agents to see.`,
    ],
    link: {
      href: `${input.appUrl}/${input.purpose === 'avatar' ? 'home' : 'portfolio'}`,
      label: 'Open Raising Talents',
    },
  });
}

export function mediaRejectedEmail(input: {
  to: string;
  kind: 'image' | 'video';
  purpose: 'avatar' | 'portfolio';
  reason: string;
  appUrl: string;
}): EmailMessage {
  const name = fileName(input.kind, input.purpose);
  return email({
    to: input.to,
    subject: `Your ${name} was not approved`,
    paragraphs: [
      `A moderator checked your ${name} and could not approve it.`,
      input.reason,
      'The file has been removed. You can upload a different one at any time.',
    ],
    link: {
      href: `${input.appUrl}/${input.purpose === 'avatar' ? 'onboarding/talent/photo' : 'portfolio'}`,
      label: input.purpose === 'avatar' ? 'Choose a new photo' : 'Open your portfolio',
    },
  });
}

export function agentVerifiedEmail(input: { to: string; appUrl: string }): EmailMessage {
  return email({
    to: input.to,
    subject: 'Your agency is verified',
    paragraphs: [
      'A moderator checked your evidence and verified your agency. Talent now see the verified badge on your profile.',
    ],
    link: { href: `${input.appUrl}/home`, label: 'Open Raising Talents' },
  });
}

export function agentDeclinedEmail(input: {
  to: string;
  reason: string;
  appUrl: string;
}): EmailMessage {
  return email({
    to: input.to,
    subject: 'We could not verify your agency yet',
    paragraphs: [
      'A moderator checked your verification request and could not verify your agency this time.',
      input.reason,
      'You can send new evidence whenever you are ready.',
    ],
    link: { href: `${input.appUrl}/verification`, label: 'Send new evidence' },
  });
}

export function deletionScheduledEmail(input: {
  to: string;
  scheduledFor: Date;
  appUrl: string;
}): EmailMessage {
  const date = new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'long',
    timeZone: 'Africa/Lagos',
  }).format(input.scheduledFor);
  return email({
    to: input.to,
    subject: 'Your Raising Talents account will be deleted',
    paragraphs: [
      `You asked us to delete your account. It is hidden from agents now, and on ${date} we will erase it with your profile, portfolio and files.`,
      'Changed your mind? Sign in before then and choose Keep my account.',
      'If you did not ask for this, sign in, keep your account, and change your password.',
    ],
    link: { href: `${input.appUrl}/sign-in`, label: 'Sign in to keep your account' },
  });
}

/** Why a moderator acted, in words the account holder reads. */
const RESTRICTION_REASON: Record<ReportCategory, string> = {
  fake_or_impersonation: 'The profile was not genuine, or pretended to be someone else.',
  inappropriate_content: 'The profile showed content that breaks the Community Guidelines.',
  scam_or_harassment: 'The account was used to ask people for money, scam them or harass them.',
  underage: 'We believe the account holder is under 18, the minimum age for Raising Talents.',
  other: 'The account broke the Community Guidelines.',
};

export function accountRestrictedEmail(input: {
  to: string;
  action: 'suspend' | 'ban';
  reason: ReportCategory;
  supportEmail: string;
}): EmailMessage {
  const suspended = input.action === 'suspend';
  return email({
    to: input.to,
    subject: suspended
      ? 'Your Raising Talents account is suspended'
      : 'Your Raising Talents account has been closed',
    paragraphs: [
      suspended
        ? 'We have suspended your account after a moderator reviewed reports about it.'
        : 'We have closed your account after a moderator reviewed reports about it.',
      RESTRICTION_REASON[input.reason],
      suspended
        ? 'While it is suspended you cannot sign in, and agents cannot see your profile.'
        : 'You can no longer sign in, and agents cannot see your profile.',
      `If you think this is a mistake, write to ${input.supportEmail} and tell us why. A different moderator will look at it.`,
    ],
    link: {
      href: `mailto:${input.supportEmail}?subject=${encodeURIComponent('Appeal')}`,
      label: 'Write to us to appeal',
    },
  });
}

export function accountReinstatedEmail(input: { to: string; appUrl: string }): EmailMessage {
  return email({
    to: input.to,
    subject: 'Your Raising Talents account is back',
    paragraphs: [
      'We have lifted the restriction on your account. You can sign in again, and agents can see your profile once more.',
    ],
    link: { href: `${input.appUrl}/sign-in`, label: 'Sign in' },
  });
}

/** The request's text stays in the app: people read it signed in, where they can report it. */
export function contactRequestedEmail(input: {
  to: string;
  agencyName: string;
  conversationId: string;
  appUrl: string;
}): EmailMessage {
  return email({
    to: input.to,
    subject: `${input.agencyName} would like to contact you`,
    paragraphs: [
      `A verified agent from ${input.agencyName} sent you a contact request on Raising Talents.`,
      'Read it in the app, then accept to start chatting, or decline. They only see your answer, never your email address.',
    ],
    link: { href: `${input.appUrl}/messages/${input.conversationId}`, label: 'Read the request' },
  });
}

export function contactAcceptedEmail(input: {
  to: string;
  talentName: string;
  conversationId: string;
  appUrl: string;
}): EmailMessage {
  return email({
    to: input.to,
    subject: `${input.talentName} accepted your request`,
    paragraphs: [`${input.talentName} accepted your contact request. You can chat now.`],
    link: { href: `${input.appUrl}/messages/${input.conversationId}`, label: 'Open the chat' },
  });
}
