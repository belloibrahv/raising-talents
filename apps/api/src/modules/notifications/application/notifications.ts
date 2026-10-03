import { reportCategorySchema, type ReportCategory } from '@rt/contracts';
import type { Logger } from 'pino';
import type { Clock } from '../../../platform/clock.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import type { EmailMessage, EmailSender } from '../../../platform/email/email-sender.js';
import {
  agentDeclinedEmail,
  accountReinstatedEmail,
  accountRestrictedEmail,
  deletionScheduledEmail,
  agentVerifiedEmail,
  mediaApprovedEmail,
  mediaRejectedEmail,
} from './emails.js';

export const NOTIFICATIONS = {
  Log: Symbol('NotificationLog'),
  EventHandlers: Symbol('NotificationEventHandlers'),
} as const;

/** Which notifications went out. Events can arrive twice; an email must not. */
export interface NotificationLog {
  wasSent(key: string): Promise<boolean>;
  markSent(key: string, at: Date): Promise<void>;
}

export interface NotificationRecipients {
  findSummaryById(id: string): Promise<{ email: string } | null>;
}

export interface NotificationMedia {
  describe(ids: readonly string[]): Promise<
    Map<
      string,
      {
        ownerId: string;
        purpose: 'avatar' | 'portfolio';
        kind: 'image' | 'video';
        status: string;
        rejectionReason: string | null;
        reviewed: boolean;
      }
    >
  >;
}

export interface NotificationVerifications {
  outcome(
    requestId: string,
  ): Promise<{ agentId: string; status: string; declineReason: string | null } | null>;
}

const isReportCategory = (value: unknown): value is ReportCategory =>
  reportCategorySchema.safeParse(value).success;

/** The same event always gives the same key, so a redelivery is recognised. */
const keyFor = (event: DomainEvent) =>
  `${event.type}:${event.aggregateId}:${event.occurredAt.toISOString()}`;

/**
 * Runs in the worker. Reads the current state through other modules' facades, builds the
 * email, sends it, then records it. Sending first means a failure is retried by the outbox;
 * the rare crash between sending and recording sends twice rather than never.
 */
export class Notifier {
  constructor(
    private readonly email: EmailSender,
    private readonly log: NotificationLog,
    private readonly recipients: NotificationRecipients,
    private readonly media: NotificationMedia,
    private readonly verifications: NotificationVerifications,
    private readonly appUrl: string,
    private readonly supportEmail: string,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** A moderator approved or rejected held media. Instant scan results are shown in the app instead. */
  async mediaDecided(event: DomainEvent): Promise<void> {
    const file = (await this.media.describe([event.aggregateId])).get(event.aggregateId);
    if (!file?.reviewed) return;
    await this.sendOnce(event, file.ownerId, (to) =>
      file.status === 'ready'
        ? mediaApprovedEmail({ to, kind: file.kind, purpose: file.purpose, appUrl: this.appUrl })
        : file.status === 'rejected' && file.rejectionReason
          ? mediaRejectedEmail({
              to,
              kind: file.kind,
              purpose: file.purpose,
              reason: file.rejectionReason,
              appUrl: this.appUrl,
            })
          : null,
    );
  }

  async verificationDecided(event: DomainEvent): Promise<void> {
    const outcome = await this.verifications.outcome(event.aggregateId);
    if (!outcome) return;
    await this.sendOnce(event, outcome.agentId, (to) =>
      outcome.status === 'approved'
        ? agentVerifiedEmail({ to, appUrl: this.appUrl })
        : outcome.status === 'declined' && outcome.declineReason
          ? agentDeclinedEmail({ to, reason: outcome.declineReason, appUrl: this.appUrl })
          : null,
    );
  }

  /** Confirms a deletion request, with the date and how to undo it. */
  async deletionScheduled(event: DomainEvent): Promise<void> {
    const scheduledFor = new Date(String(event.payload['scheduledFor']));
    if (Number.isNaN(scheduledFor.getTime())) return;
    await this.sendOnce(event, event.aggregateId, (to) =>
      deletionScheduledEmail({ to, scheduledFor, appUrl: this.appUrl }),
    );
  }

  /** Tells a suspended or banned member why, and how to appeal. */
  async accountRestricted(event: DomainEvent, action: 'suspend' | 'ban'): Promise<void> {
    const reason = event.payload['reason'];
    if (!isReportCategory(reason)) return;
    await this.sendOnce(event, event.aggregateId, (to) =>
      accountRestrictedEmail({ to, action, reason, supportEmail: this.supportEmail }),
    );
  }

  async accountReinstated(event: DomainEvent): Promise<void> {
    await this.sendOnce(event, event.aggregateId, (to) =>
      accountReinstatedEmail({ to, appUrl: this.appUrl }),
    );
  }

  private async sendOnce(
    event: DomainEvent,
    userId: string,
    build: (to: string) => EmailMessage | null,
  ): Promise<void> {
    const key = keyFor(event);
    if (await this.log.wasSent(key)) return;
    const recipient = await this.recipients.findSummaryById(userId);
    const message = recipient ? build(recipient.email) : null;
    if (!message) return;
    await this.email.send(message);
    await this.log.markSent(key, this.clock.now());
    this.logger.info(
      { eventType: event.type, aggregateId: event.aggregateId },
      'notification sent',
    );
  }
}
