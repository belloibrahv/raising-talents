import { and, asc, count, desc, eq, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { DrizzleUnitOfWork } from '../../../platform/database/drizzle-unit-of-work.js';
import {
  NOTES_SHOWN,
  type EnforcementAction,
  type OpenSubject,
  type Report,
  type ReportRepository,
} from '../domain/report.js';
import { enforcementActions, reports } from './safety.schema.js';

const isOpen = eq(reports.status, 'open');

export class DrizzleReportRepository implements ReportRepository {
  constructor(private readonly uow: DrizzleUnitOfWork) {}

  async add(report: Report): Promise<boolean> {
    const inserted = await this.uow
      .executor()
      .insert(reports)
      .values({
        ...report,
        evidence: report.evidence.map((entry) => ({
          body: entry.body,
          sentAt: entry.sentAt.toISOString(),
        })),
      })
      // Either unique index: one open report per reporter and account, and per post.
      .onConflictDoNothing()
      .returning({ id: reports.id });
    return inserted.length > 0;
  }

  async openSubjects(
    after: { firstReportedAt: Date; subjectId: string } | null,
    limit: number,
  ): Promise<OpenSubject[]> {
    const db = this.uow.executor();
    const first = sql<Date>`min(${reports.createdAt})`;
    const subjects = await db
      .select({ subjectId: reports.subjectId, firstReportedAt: first, total: count() })
      .from(reports)
      .where(isOpen)
      .groupBy(reports.subjectId)
      .having(
        after
          ? sql`(${first}, ${reports.subjectId}) > (${after.firstReportedAt.toISOString()}::timestamptz, ${after.subjectId}::uuid)`
          : undefined,
      )
      .orderBy(asc(first), asc(reports.subjectId))
      .limit(limit);
    if (subjects.length === 0) return [];

    const ids = subjects.map((subject) => subject.subjectId);
    const [categoryRows, noteRows, evidenceRows, mediaRows] = await Promise.all([
      db
        .select({ subjectId: reports.subjectId, category: reports.category, count: count() })
        .from(reports)
        .where(and(isOpen, inArray(reports.subjectId, ids)))
        .groupBy(reports.subjectId, reports.category),
      // Newest first; each account keeps its first NOTES_SHOWN below.
      db
        .select({
          subjectId: reports.subjectId,
          note: reports.note,
          reportedAt: reports.createdAt,
        })
        .from(reports)
        .where(and(isOpen, inArray(reports.subjectId, ids), ne(reports.note, '')))
        .orderBy(desc(reports.createdAt)),
      // Newest first; each account keeps the first one that has any.
      db
        .select({ subjectId: reports.subjectId, evidence: reports.evidence })
        .from(reports)
        .where(
          and(
            isOpen,
            inArray(reports.subjectId, ids),
            sql`jsonb_array_length(${reports.evidence}) > 0`,
          ),
        )
        .orderBy(desc(reports.createdAt)),
      db
        .select({ subjectId: reports.subjectId, mediaId: reports.mediaId, count: count() })
        .from(reports)
        .where(and(isOpen, inArray(reports.subjectId, ids), isNotNull(reports.mediaId)))
        .groupBy(reports.subjectId, reports.mediaId),
    ]);

    return subjects.map((subject) => ({
      subjectId: subject.subjectId,
      // min() comes back as text from the driver, not through the column's mapping.
      firstReportedAt: new Date(subject.firstReportedAt),
      total: subject.total,
      categories: categoryRows
        .filter((row) => row.subjectId === subject.subjectId)
        .map((row) => ({ category: row.category, count: row.count }))
        .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
      notes: noteRows
        .filter((row) => row.subjectId === subject.subjectId)
        .slice(0, NOTES_SHOWN)
        .map((row) => ({ note: row.note, reportedAt: row.reportedAt })),
      evidence: (
        evidenceRows.find((row) => row.subjectId === subject.subjectId)?.evidence ?? []
      ).map((entry) => ({ body: entry.body, sentAt: new Date(entry.sentAt) })),
      media: mediaRows
        .filter((row) => row.subjectId === subject.subjectId)
        .flatMap((row) => (row.mediaId ? [{ mediaId: row.mediaId, count: row.count }] : []))
        .sort((a, b) => b.count - a.count || a.mediaId.localeCompare(b.mediaId)),
    }));
  }

  async closeOpen(
    subjectId: string,
    outcome: 'dismissed' | 'actioned',
    closedBy: string,
    now: Date,
  ): Promise<number> {
    const closed = await this.uow
      .executor()
      .update(reports)
      .set({ status: outcome, closedAt: now, closedBy })
      .where(and(isOpen, eq(reports.subjectId, subjectId)))
      .returning({ id: reports.id });
    return closed.length;
  }

  async recordAction(action: EnforcementAction): Promise<void> {
    await this.uow.executor().insert(enforcementActions).values(action);
  }

  async countRestrictions(accountId: string): Promise<number> {
    const [row] = await this.uow
      .executor()
      .select({ total: count() })
      .from(enforcementActions)
      .where(
        and(
          eq(enforcementActions.accountId, accountId),
          ne(enforcementActions.action, 'reinstate'),
        ),
      );
    return row?.total ?? 0;
  }
}
