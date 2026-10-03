import { SpanKind, SpanStatusCode, trace } from '@opentelemetry/api';
import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailMessage, EmailSender } from './email-sender.js';

export interface SmtpSettings {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user?: string | undefined;
  readonly password?: string | undefined;
  readonly from: string;
}

/** Mailpit in development, Amazon SES over SMTP in staging and production. */
export class SmtpEmailSender implements EmailSender {
  private readonly transporter: Transporter;

  constructor(private readonly settings: SmtpSettings) {
    this.transporter = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      ...(settings.user && settings.password
        ? { auth: { user: settings.user, pass: settings.password } }
        : {}),
    });
  }

  /** Traced as one span. The recipient is left out: an email address is personal data. */
  async send(message: EmailMessage): Promise<void> {
    await trace.getTracer('raising-talents.email').startActiveSpan(
      'email send',
      {
        kind: SpanKind.CLIENT,
        attributes: { 'email.provider': 'smtp', 'server.address': this.settings.host },
      },
      async (span) => {
        try {
          await this.transporter.sendMail({ from: this.settings.from, ...message });
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
