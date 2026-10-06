import type { Logger } from 'pino';
import type { ScheduledJob } from '../../../platform/scheduling/job-scheduler.js';
import type { UnitOfWork } from '../../../platform/unit-of-work.js';
import type { AccountsFacade } from './accounts.facade.js';

const BATCH = 50;

/**
 * With email verification off (ADR-045), verifies everyone still waiting for a code. Each
 * batch commits on its own, and the scheduler retries on its next run if one fails; once
 * nobody is waiting, a run costs one query.
 */
export class VerifyPendingAccountsJob implements ScheduledJob {
  readonly name = 'accounts.verify-pending';
  readonly everySeconds = 600;

  constructor(
    private readonly accounts: AccountsFacade,
    private readonly uow: UnitOfWork,
    private readonly logger: Logger,
  ) {}

  async run(): Promise<void> {
    let total = 0;
    for (;;) {
      const verified = await this.uow.run(() => this.accounts.verifyPending(BATCH));
      total += verified;
      if (verified < BATCH) break;
    }
    if (total > 0)
      this.logger.warn({ verified: total }, 'email verification is off: accounts verified');
  }
}
