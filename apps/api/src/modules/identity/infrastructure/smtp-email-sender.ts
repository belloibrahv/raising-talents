import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailMessage, EmailSender } from '../application/ports.js';

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

  async send(message: EmailMessage): Promise<void> {
    await this.transporter.sendMail({ from: this.settings.from, ...message });
  }
}
