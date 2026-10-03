import { ErrorCode, type VerificationDeclineCategory } from '@rt/contracts';
import { domainError, type DomainError } from '../../../platform/domain-error.js';
import type { DomainEvent } from '../../../platform/domain-event.js';
import { err, ok, type Result } from '../../../platform/result.js';

export type VerificationStatus = 'pending' | 'approved' | 'declined';

export const VerificationEvents = {
  Requested: 'agent.VerificationRequested',
  Approved: 'agent.VerificationApproved',
  Declined: 'agent.VerificationDeclined',
} as const;

export const VerificationErrors = {
  profileIncomplete: () =>
    domainError(
      ErrorCode.AgentProfileIncomplete,
      'Finish your agency profile before asking to be verified.',
    ),
  pending: () =>
    domainError(
      ErrorCode.VerificationPending,
      'Your request is with a moderator. We will decide soon.',
    ),
  alreadyVerified: () => domainError(ErrorCode.AlreadyVerified, 'Your agency is already verified.'),
  notFound: () => domainError(ErrorCode.NotFound, 'This verification request does not exist.'),
  alreadyDecided: () => domainError(ErrorCode.Conflict, 'This request has already been decided.'),
};

/** The sentence the agent reads for each decline reason. Provisional (ADR-026). */
export const DECLINE_REASON: Record<VerificationDeclineCategory, string> = {
  agency_not_confirmed:
    'We could not confirm that you work for this agency. Send a page from the agency that names you.',
  details_do_not_match:
    'The details on your profile do not match the evidence. Check the agency name and try again.',
  evidence_unreachable: 'We could not open the page you sent. Check the address and try again.',
  other: 'We could not verify your agency this time. Reply to our email if you need help.',
};

export interface VerificationRequestProps {
  readonly id: string;
  readonly agentId: string;
  readonly status: VerificationStatus;
  readonly evidenceUrl: string;
  readonly registrationNumber: string | null;
  readonly note: string;
  readonly submittedAt: Date;
  readonly decidedBy: string | null;
  readonly decidedAt: Date | null;
  readonly declineCategory: VerificationDeclineCategory | null;
}

/** One request to be verified, and the moderator's decision. Old requests are kept as history. */
export class VerificationRequest {
  private pendingEvents: DomainEvent[] = [];

  private constructor(private props: VerificationRequestProps) {}

  static submit(input: {
    id: string;
    agentId: string;
    evidenceUrl: string;
    registrationNumber: string | null;
    note: string;
    now: Date;
  }): VerificationRequest {
    const request = new VerificationRequest({
      id: input.id,
      agentId: input.agentId,
      status: 'pending',
      evidenceUrl: input.evidenceUrl,
      registrationNumber: input.registrationNumber,
      note: input.note,
      submittedAt: input.now,
      decidedBy: null,
      decidedAt: null,
      declineCategory: null,
    });
    request.raise(VerificationEvents.Requested, input.now);
    return request;
  }

  static restore(props: VerificationRequestProps): VerificationRequest {
    return new VerificationRequest(props);
  }

  get id(): string {
    return this.props.id;
  }
  get agentId(): string {
    return this.props.agentId;
  }
  get status(): VerificationStatus {
    return this.props.status;
  }

  snapshot(): VerificationRequestProps {
    return { ...this.props };
  }

  decide(
    decision: { approve: true } | { approve: false; category: VerificationDeclineCategory },
    moderatorId: string,
    now: Date,
  ): Result<void, DomainError> {
    if (this.props.status !== 'pending') return err(VerificationErrors.alreadyDecided());
    const decided = { decidedBy: moderatorId, decidedAt: now };
    if (decision.approve) {
      this.props = { ...this.props, ...decided, status: 'approved' };
      this.raise(VerificationEvents.Approved, now);
    } else {
      this.props = {
        ...this.props,
        ...decided,
        status: 'declined',
        declineCategory: decision.category,
      };
      this.raise(VerificationEvents.Declined, now);
    }
    return ok(undefined);
  }

  pullEvents(): DomainEvent[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  private raise(type: string, occurredAt: Date): void {
    this.pendingEvents.push({
      type,
      aggregateId: this.props.id,
      occurredAt,
      payload: { agentId: this.props.agentId },
    });
  }
}

/** The repository throws this when the agent already has a pending request. */
export class PendingVerificationExistsError extends Error {}

export interface VerificationRequestRepository {
  findById(id: string, options?: { lock?: boolean }): Promise<VerificationRequest | null>;
  findLatestForAgent(agentId: string): Promise<VerificationRequest | null>;
  countDeclined(agentId: string): Promise<number>;
  /** Pending requests, oldest first, after the given position in that order. */
  findPending(
    after: { submittedAt: Date; id: string } | null,
    limit: number,
  ): Promise<VerificationRequest[]>;
  save(request: VerificationRequest): Promise<void>;
}
