import { asc, eq } from 'drizzle-orm';
import type { Clock } from '../../../platform/clock.js';
import type { Database } from '../../../platform/database/client.js';
import { TaxonomyCatalog, type TaxonomySource } from '../application/taxonomy-catalog.js';
import { categories, cities, skills, subcategories } from './taxonomy.schema.js';

const REFRESH_AFTER_MS = 5 * 60 * 1000;

/**
 * Reference lists change only through migrations, so they are read once and kept
 * for five minutes. Concurrent callers during a refresh share one database read.
 */
export class CachedTaxonomySource implements TaxonomySource {
  private cached: { catalog: TaxonomyCatalog; loadedAt: number } | undefined;
  private loading: Promise<TaxonomyCatalog> | undefined;

  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async current(): Promise<TaxonomyCatalog> {
    const now = this.clock.now().getTime();
    if (this.cached && now - this.cached.loadedAt < REFRESH_AFTER_MS) return this.cached.catalog;
    this.loading ??= this.load(now).finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }

  private async load(now: number): Promise<TaxonomyCatalog> {
    const [categoryRows, subcategoryRows, skillRows, cityRows] = await Promise.all([
      this.db
        .select()
        .from(categories)
        .where(eq(categories.active, true))
        .orderBy(asc(categories.position)),
      this.db
        .select()
        .from(subcategories)
        .where(eq(subcategories.active, true))
        .orderBy(asc(subcategories.position)),
      this.db.select().from(skills).where(eq(skills.active, true)).orderBy(asc(skills.name)),
      this.db.select().from(cities).where(eq(cities.active, true)).orderBy(asc(cities.name)),
    ]);
    const catalog = new TaxonomyCatalog({
      categories: categoryRows,
      subcategories: subcategoryRows,
      skills: skillRows,
      cities: cityRows,
    });
    this.cached = { catalog, loadedAt: now };
    return catalog;
  }
}
