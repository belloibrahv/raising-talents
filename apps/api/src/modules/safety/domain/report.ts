import type { ReportCategory } from '@rt/contracts';

export type ReportStatus = 'open' | 'dismissed' | 'actioned';

/** One member's report about another. The reporter is never shown to the reported person. */
export interface Report {
  readonly id: string;
  /** Null once the reporter's own account is erased; the report still counts. */
  readonly reporterId: string | null;
  readonly subjectId: string;
  readonly category: ReportCategory;
  readonly note: string;
  readonly status: ReportStatus;
  readonly createdAt: Date;
  readonly closedAt: Date | null;
  readonly closedBy: string | null;
}

/** A change to an account's standing, kept as the audit trail for staff decisions. */
export interface EnforcementAction {
  readonly id: string;
  readonly accountId: string;
  readonly action: 'suspend' | 'ban' | 'reinstate';
  readonly reason: ReportCategory | null;
  /** The moderator, or the operator who ran the reinstate script. */
  readonly actorId: string;
  readonly createdAt: Date;
}

/** A reported account with its open reports, as the queue shows it. */
export interface OpenSubject {
  readonly subjectId: string;
  readonly firstReportedAt: Date;
  readonly total: number;
  readonly categories: readonly { category: ReportCategory; count: number }[];
  /** Non-empty notes, newest first, at most NOTES_SHOWN. */
  readonly notes: readonly { note: string; reportedAt: Date }[];
}

export const NOTES_SHOWN = 5;

export interface ReportRepository {
  /** False when the reporter already has an open report on this account: nothing is added. */
  add(report: Report): Promise<boolean>;
  /** Accounts with open reports, the longest waiting first. */
  openSubjects(
    after: { firstReportedAt: Date; subjectId: string } | null,
    limit: number,
  ): Promise<OpenSubject[]>;
  /** Closes every open report on the account and returns how many there were. */
  closeOpen(
    subjectId: string,
    outcome: 'dismissed' | 'actioned',
    closedBy: string,
    now: Date,
  ): Promise<number>;
  recordAction(action: EnforcementAction): Promise<void>;
  /** Earlier suspensions and bans of the account. */
  countRestrictions(accountId: string): Promise<number>;
}
