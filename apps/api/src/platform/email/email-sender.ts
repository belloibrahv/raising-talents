/** One email, in plain text and HTML. Every module that emails people uses this. */
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

/** SES in AWS, SMTP (Mailpit) locally. Chosen by EMAIL_TRANSPORT. */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
