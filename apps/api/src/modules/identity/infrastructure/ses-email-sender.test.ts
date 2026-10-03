import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { describe, expect, it } from 'vitest';
import { verificationCodeEmail } from '../application/emails/verification-code.template.js';
import { SesEmailSender } from './ses-email-sender.js';

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

    await sender.send(verificationCodeEmail({ to: 'kemi.lawal@example.com', code: '482913' }));

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
    await expect(
      sender.send(verificationCodeEmail({ to: 'x@example.com', code: '111111' })),
    ).rejects.toThrow('Throttling');
  });
});
