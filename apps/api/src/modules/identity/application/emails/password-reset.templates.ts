import { CODE_TTL_MINUTES } from '../../domain/one-time-code.js';
import type { EmailMessage } from '../ports.js';

const wrap = (body: string) => `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #111111; line-height: 1.5;">
${body}
  </body>
</html>`;

export function passwordResetCodeEmail(input: { to: string; code: string }): EmailMessage {
  const subject = `${input.code} is your Raising Talents reset code`;
  const text = [
    `Your Raising Talents password reset code is ${input.code}.`,
    '',
    `Enter it in the app with your new password. It expires in ${CODE_TTL_MINUTES} minutes.`,
    '',
    'If you did not ask to reset your password, you can ignore this email. Your password has not changed.',
  ].join('\n');
  const html = wrap(`    <p>Your Raising Talents password reset code is:</p>
    <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px;">${input.code}</p>
    <p>Enter it in the app with your new password. It expires in ${CODE_TTL_MINUTES} minutes.</p>
    <p style="color: #555555;">If you did not ask to reset your password, you can ignore this email. Your password has not changed.</p>`);
  return { to: input.to, subject, text, html };
}

export function passwordChangedEmail(input: {
  to: string;
  /** A reset signs out every device; a change in the app keeps the one that made it. */
  signedOut?: 'all' | 'others';
}): EmailMessage {
  const subject = 'Your Raising Talents password was changed';
  const devices =
    input.signedOut === 'others'
      ? 'and your other devices were signed out'
      : 'and every device was signed out';
  const text = [
    `The password for your Raising Talents account was just changed, ${devices}.`,
    '',
    'If this was you, there is nothing else to do.',
    '',
    'If it was not you, reset your password now from the sign-in screen and reply to this email so we can help.',
  ].join('\n');
  const html =
    wrap(`    <p>The password for your Raising Talents account was just changed, ${devices}.</p>
    <p>If this was you, there is nothing else to do.</p>
    <p><strong>If it was not you</strong>, reset your password now from the sign-in screen and reply to this email so we can help.</p>`);
  return { to: input.to, subject, text, html };
}
