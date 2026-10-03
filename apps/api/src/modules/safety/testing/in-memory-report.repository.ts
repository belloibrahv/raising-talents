import type { ReportCategory } from '@rt/contracts';
import {
  NOTES_SHOWN,
  type EnforcementAction,
  type OpenSubject,
  type Report,
  type ReportRepository,
} from '../domain/report.js';

export class InMemoryReportRepository implements ReportRepository {
  readonly reports: Report[] = [];
  readonly actions: EnforcementAction[] = [];

  add(report: Report): Promise<boolean> {
    const duplicate = this.reports.some(
      (existing) =>
        existing.status === 'open' &&
        existing.reporterId === report.reporterId &&
        existing.subjectId === report.subjectId,
    );
    if (!duplicate) this.reports.push(report);
    return Promise.resolve(!duplicate);
  }

  openSubjects(
    after: { firstReportedAt: Date; subjectId: string } | null,
    limit: number,
  ): Promise<OpenSubject[]> {
    const bySubject = new Map<string, Report[]>();
    for (const report of this.reports.filter((entry) => entry.status === 'open')) {
      bySubject.set(report.subjectId, [...(bySubject.get(report.subjectId) ?? []), report]);
    }
    const subjects = [...bySubject.entries()].map(([subjectId, reports]): OpenSubject => {
      const counts = new Map<ReportCategory, number>();
      for (const report of reports)
        counts.set(report.category, (counts.get(report.category) ?? 0) + 1);
      return {
        subjectId,
        firstReportedAt: new Date(Math.min(...reports.map((report) => report.createdAt.getTime()))),
        total: reports.length,
        categories: [...counts.entries()]
          .map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
        notes: reports
          .filter((report) => report.note !== '')
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, NOTES_SHOWN)
          .map((report) => ({ note: report.note, reportedAt: report.createdAt })),
      };
    });
    const key = (subject: { firstReportedAt: Date; subjectId: string }) =>
      `${subject.firstReportedAt.toISOString()}|${subject.subjectId}`;
    return Promise.resolve(
      subjects
        .sort((a, b) => key(a).localeCompare(key(b)))
        .filter((subject) => !after || key(subject) > key(after))
        .slice(0, limit),
    );
  }

  closeOpen(
    subjectId: string,
    outcome: 'dismissed' | 'actioned',
    closedBy: string,
    now: Date,
  ): Promise<number> {
    let closed = 0;
    this.reports.forEach((report, index) => {
      if (report.subjectId !== subjectId || report.status !== 'open') return;
      this.reports[index] = { ...report, status: outcome, closedAt: now, closedBy };
      closed += 1;
    });
    return Promise.resolve(closed);
  }

  recordAction(action: EnforcementAction): Promise<void> {
    this.actions.push(action);
    return Promise.resolve();
  }

  countRestrictions(accountId: string): Promise<number> {
    return Promise.resolve(
      this.actions.filter((entry) => entry.accountId === accountId && entry.action !== 'reinstate')
        .length,
    );
  }
}
