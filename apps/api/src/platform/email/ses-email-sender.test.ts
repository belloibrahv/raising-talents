import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { describe, expect, it } from 'vitest';
import { SesEmailSender } from './ses-email-sender.js';

/** A plain message, so this platform test does not depend on any module's templates. */
const message = (to: string, code: string) => ({
  to,
  subject: `${code} is your Raising Talents code`,
  text: `Your Raising Talents verification code is ${code}.`,
  html: `<p>Your Raising Talents verification code is <strong>${code}</strong>.</p>`,
});

describe('SesEmailSender', () => {
  it('sends text and HTML through the SES API with the configured sender', async () => {
    const sent: SendEmailCommand[] = [];
    const sender = new SesEmailSender(
      {
        send: (command: unknown) => {
          sent.push(command as SendEmailCommand);
          return Promise.resolve({});
        },
      } as never,
      'Raising Talents <no-reply@staging.raisingtalents.app>',
      'rt-staging',
    );

    await sender.send(message('kemi.lawal@example.com', '482913'));

    expect(sent[0]?.input).toMatchObject({
      FromEmailAddress: 'Raising Talents <no-reply@staging.raisingtalents.app>',
      Destination: { ToAddresses: ['kemi.lawal@example.com'] },
      ConfigurationSetName: 'rt-staging',
      Content: { Simple: { Subject: { Data: '482913 is your Raising Talents code' } } },
    });
  });

  it('passes provider failures up so the outbox retries', async () => {
    const sender = new SesEmailSender(
      {
        send: () => Promise.reject(new Error('Throttling: Maximum sending rate exceeded')),
      } as never,
      'a@b.c',
    );
    await expect(sender.send(message('x@example.com', '111111'))).rejects.toThrow('Throttling');
  });
});
