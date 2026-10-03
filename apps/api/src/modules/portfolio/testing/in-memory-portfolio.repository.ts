import type { EventRecorder } from '../../../platform/domain-event.js';
import {
  Portfolio,
  PortfolioConcurrencyError,
  type PortfolioRepository,
} from '../domain/portfolio.js';

export class InMemoryPortfolioRepository implements PortfolioRepository {
  readonly rows = new Map<string, ReturnType<Portfolio['snapshot']>>();

  constructor(private readonly events: EventRecorder) {}

  async findByTalentId(talentId: string): Promise<Portfolio | null> {
    const row = this.rows.get(talentId);
    return row ? Portfolio.restore(row) : null;
  }

  async save(portfolio: Portfolio): Promise<void> {
    const props = portfolio.snapshot();
    if (!portfolio.isStored && this.rows.has(props.talentId))
      throw new PortfolioConcurrencyError('portfolio');
    const mediaElsewhere = [...this.rows.values()]
      .filter((row) => row.talentId !== props.talentId)
      .flatMap((row) => row.items.map((item) => item.mediaId));
    if (props.items.some((item) => mediaElsewhere.includes(item.mediaId)))
      throw new PortfolioConcurrencyError('media');
    this.rows.set(props.talentId, props);
    portfolio.markStored();
    await this.events.record(portfolio.pullEvents());
  }
}
