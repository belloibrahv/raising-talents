import { CODE_TTL_MINUTES } from '../../domain/one-time-code.js';
import type { EmailMessage } from '../ports.js';

export function verificationCodeEmail(input: { to: string; code: string }): EmailMessage {
  const subject = `${input.code} is your Raising Talents code`;
  const text = [
    `Your Raising Talents verification code is ${input.code}.`,
    '',
    `Enter it in the app to confirm your email. It expires in ${CODE_TTL_MINUTES} minutes.`,
    '',
    'If you did not create a Raising Talents account, you can ignore this email.',
  ].join('\n');
  const html = `<!doctype html>
<html>
  <body style="font-family: Arial, sans-serif; color: #111111; line-height: 1.5;">
    <p>Your Raising Talents verification code is:</p>
    <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px;">${input.code}</p>
    <p>Enter it in the app to confirm your email. It expires in ${CODE_TTL_MINUTES} minutes.</p>
    <p style="color: #555555;">If you did not create a Raising Talents account, you can ignore this email.</p>
  </body>
</html>`;
  return { to: input.to, subject, text, html };
}
