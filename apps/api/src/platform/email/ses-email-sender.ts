import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import { SendEmailCommand, type SESv2Client } from '@aws-sdk/client-sesv2';
import type { EmailMessage, EmailSender } from './email-sender.js';

/**
 * Amazon SES through its API, authenticated by the ECS task's IAM role.
 * No SMTP password or access key exists anywhere: AWS rotates the role's
 * short-lived credentials automatically.
 */
export class SesEmailSender implements EmailSender {
  constructor(
    private readonly client: Pick<SESv2Client, 'send'>,
    private readonly from: string,
    private readonly configurationSet?: string,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    await trace
      .getTracer('raising-talents.email')
      .startActiveSpan(
        'email send',
        { kind: SpanKind.CLIENT, attributes: { 'email.provider': 'ses' } },
        async (span) => {
          try {
            await this.client.send(
              new SendEmailCommand({
                FromEmailAddress: this.from,
                Destination: { ToAddresses: [message.to] },
                ...(this.configurationSet ? { ConfigurationSetName: this.configurationSet } : {}),
                Content: {
                  Simple: {
                    Subject: { Data: message.subject, Charset: 'UTF-8' },
                    Body: {
                      Text: { Data: message.text, Charset: 'UTF-8' },
                      Html: { Data: message.html, Charset: 'UTF-8' },
                    },
                  },
                },
              }),
            );
          } catch (error) {
            span.recordException(error instanceof Error ? error : new Error(String(error)));
            span.setStatus({ code: SpanStatusCode.ERROR });
            throw error;
          } finally {
            span.end();
          }
        },
      );
  }
}
