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
  contactAcceptedEmail,
  contactRequestedEmail,
  mediaApprovedEmail,
  mediaRejectedEmail,
} from './emails.js';
import { newId } from '../../../platform/ids.js';
import type { Inbox, NoticeContent } from './inbox.js';

export const NOTIFICATIONS = {
  Log: Symbol('NotificationLog'),
  Inbox: Symbol('Inbox'),
  List: Symbol('ListNotificationsQuery'),
  Unread: Symbol('UnreadCountQuery'),
  MarkRead: Symbol('MarkNotificationsReadHandler'),
  Export: Symbol('NotificationsExport'),
  Prune: Symbol('InboxPruneJob'),
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

export interface NotificationContacts {
  describe(conversationId: string): Promise<{
    agentId: string;
    talentId: string;
    status: string;
    agencyName: string;
    talentName: string;
  } | null>;
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
    private readonly inbox: Inbox,
    private readonly recipients: NotificationRecipients,
    private readonly media: NotificationMedia,
    private readonly verifications: NotificationVerifications,
    private readonly contacts: NotificationContacts,
    private readonly appUrl: string,
    private readonly supportEmail: string,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  /** A moderator approved or rejected held media. Instant scan results are shown in the app instead. */
  async mediaDecided(event: DomainEvent): Promise<void> {
    const file = (await this.media.describe([event.aggregateId])).get(event.aggregateId);
    if (!file?.reviewed) return;
    const notice: NoticeContent | null =
      file.status === 'ready'
        ? { kind: 'media_approved', mediaKind: file.kind, purpose: file.purpose }
        : file.status === 'rejected' && file.rejectionReason
          ? {
              kind: 'media_rejected',
              mediaKind: file.kind,
              purpose: file.purpose,
              reason: file.rejectionReason,
            }
          : null;
    await this.deliver(event, file.ownerId, notice, (to) =>
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
    const notice: NoticeContent | null =
      outcome.status === 'approved'
        ? { kind: 'agent_verified' }
        : outcome.status === 'declined' && outcome.declineReason
          ? { kind: 'agent_declined', reason: outcome.declineReason }
          : null;
    await this.deliver(event, outcome.agentId, notice, (to) =>
      outcome.status === 'approved'
        ? agentVerifiedEmail({ to, appUrl: this.appUrl })
        : outcome.status === 'declined' && outcome.declineReason
          ? agentDeclinedEmail({ to, reason: outcome.declineReason, appUrl: this.appUrl })
          : null,
    );
  }

  /** A verified agent asked to contact a talent. Skipped if they withdrew before it went out. */
  async contactRequested(event: DomainEvent): Promise<void> {
    const contact = await this.contacts.describe(event.aggregateId);
    if (contact?.status !== 'requested') return;
    const notice: NoticeContent = {
      kind: 'contact_requested',
      conversationId: event.aggregateId,
      agencyName: contact.agencyName,
    };
    await this.deliver(event, contact.talentId, notice, (to) =>
      contactRequestedEmail({
        to,
        agencyName: contact.agencyName,
        conversationId: event.aggregateId,
        appUrl: this.appUrl,
      }),
    );
  }

  /** The talent answered. A decline is told in the app only, which is gentler. */
  async contactAnswered(event: DomainEvent, accepted: boolean): Promise<void> {
    const contact = await this.contacts.describe(event.aggregateId);
    if (!contact) return;
    const notice: NoticeContent = accepted
      ? {
          kind: 'contact_accepted',
          conversationId: event.aggregateId,
          talentName: contact.talentName,
        }
      : { kind: 'contact_declined', talentName: contact.talentName };
    await this.deliver(
      event,
      contact.agentId,
      notice,
      accepted
        ? (to) =>
            contactAcceptedEmail({
              to,
              talentName: contact.talentName,
              conversationId: event.aggregateId,
              appUrl: this.appUrl,
            })
        : null,
    );
  }

  /** Confirms a deletion request, with the date and how to undo it. */
  async deletionScheduled(event: DomainEvent): Promise<void> {
    const scheduledFor = new Date(String(event.payload['scheduledFor']));
    if (Number.isNaN(scheduledFor.getTime())) return;
    const notice: NoticeContent = {
      kind: 'deletion_scheduled',
      scheduledFor: scheduledFor.toISOString(),
    };
    await this.deliver(event, event.aggregateId, notice, (to) =>
      deletionScheduledEmail({ to, scheduledFor, appUrl: this.appUrl }),
    );
  }

  /** Tells a suspended or banned member why, and how to appeal. */
  async accountRestricted(event: DomainEvent, action: 'suspend' | 'ban'): Promise<void> {
    const reason = event.payload['reason'];
    if (!isReportCategory(reason)) return;
    // Email only: a restricted member cannot sign in to read the inbox.
    await this.deliver(event, event.aggregateId, null, (to) =>
      accountRestrictedEmail({ to, action, reason, supportEmail: this.supportEmail }),
    );
  }

  async accountReinstated(event: DomainEvent): Promise<void> {
    await this.deliver(event, event.aggregateId, { kind: 'account_reinstated' }, (to) =>
      accountReinstatedEmail({ to, appUrl: this.appUrl }),
    );
  }

  /** The inbox only: identity emails the old address itself. */
  async emailChanged(event: DomainEvent): Promise<void> {
    await this.deliver(event, event.aggregateId, { kind: 'email_changed' }, null);
  }

  /** The inbox only: identity already emails the owner when their password changes. */
  async passwordChanged(event: DomainEvent): Promise<void> {
    await this.deliver(event, event.aggregateId, { kind: 'password_changed' }, null);
  }

  /**
   * The inbox first, then the email. Each is idempotent on its own (the inbox by key, the
   * email by the sent log), so a retried event fills in whichever part failed.
   */
  private async deliver(
    event: DomainEvent,
    userId: string,
    notice: NoticeContent | null,
    build: ((to: string) => EmailMessage | null) | null,
  ): Promise<void> {
    const key = keyFor(event);
    if (notice) {
      await this.inbox.add({
        id: newId(),
        key,
        userId,
        content: notice,
        createdAt: event.occurredAt,
        readAt: null,
      });
    }
    if (!build || (await this.log.wasSent(key))) return;
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
