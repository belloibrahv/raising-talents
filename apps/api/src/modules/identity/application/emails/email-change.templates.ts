import { CODE_TTL_MINUTES } from '../../domain/one-time-code.js';
import type { EmailMessage } from '../ports.js';

const wrap = (body: string) => `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #111111; line-height: 1.5;">
${body}
  </body>
</html>`;

/** "ada@example.com" becomes "a••@example.com": enough to recognise, not enough to copy. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 1)}${'•'.repeat(Math.min(Math.max(local.length - 1, 2), 6))}@${domain}`;
}

const escape = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** To the new address: the code that proves the person reads it. */
export function emailChangeCodeEmail(input: { to: string; code: string }): EmailMessage {
  const subject = `${input.code} is your code to use this email on Raising Talents`;
  const text = [
    `Enter ${input.code} in the app to move your Raising Talents account to this address.`,
    '',
    `It expires in ${String(CODE_TTL_MINUTES)} minutes.`,
    '',
    'If you did not ask for this, ignore this email. Nothing changes without the code.',
  ].join('\n');
  const html =
    wrap(`    <p>Enter this code in the app to move your Raising Talents account to this address:</p>
    <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px;">${input.code}</p>
    <p>It expires in ${String(CODE_TTL_MINUTES)} minutes.</p>
    <p style="color: #555555;">If you did not ask for this, ignore this email. Nothing changes without the code.</p>`);
  return { to: input.to, subject, text, html };
}

/** To the old address when the change is asked for: the owner can stop it in time. */
export function emailChangeRequestedEmail(input: { to: string; newEmail: string }): EmailMessage {
  const masked = maskEmail(input.newEmail);
  const subject = 'Someone asked to change your Raising Talents email';
  const text = [
    `Someone signed in to your account asked to move it to ${masked}.`,
    '',
    'It only happens once a code sent to that address is entered.',
    '',
    'If this was not you, sign in, change your password, and sign out your other devices from your account page.',
  ].join('\n');
  const html =
    wrap(`    <p>Someone signed in to your account asked to move it to <strong>${escape(masked)}</strong>.</p>
    <p>It only happens once a code sent to that address is entered.</p>
    <p><strong>If this was not you</strong>, sign in, change your password, and sign out your other devices from your account page.</p>`);
  return { to: input.to, subject, text, html };
}

/** To the old address once the change is done. */
export function emailChangedEmail(input: { to: string; newEmail: string }): EmailMessage {
  const masked = maskEmail(input.newEmail);
  const subject = 'Your Raising Talents email was changed';
  const text = [
    `Your Raising Talents account now uses ${masked}. Emails from us will go there.`,
    '',
    'If this was not you, reply to this email straight away so we can help you get your account back.',
  ].join('\n');
  const html =
    wrap(`    <p>Your Raising Talents account now uses <strong>${escape(masked)}</strong>. Emails from us will go there.</p>
    <p><strong>If this was not you</strong>, reply to this email straight away so we can help you get your account back.</p>`);
  return { to: input.to, subject, text, html };
}
