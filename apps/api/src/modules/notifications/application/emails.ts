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
