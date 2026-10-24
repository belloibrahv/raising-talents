import { cn } from '@/lib/utils';
import { t } from '../../i18n';

type MarkVersion = 'mark' | 'spotlight' | 'ink';

/**
 * The three versions in the brand guide (section 04), as fills. Keep in step with
 * public/favicon.svg and public/brand/.
 */
const VERSIONS: Record<
  MarkVersion,
  { tile: string | null; head: string; arms: string; spark: boolean }
> = {
  // rt-mark: the default, on paper. On the dark scheme its stage tile would vanish into the
  // dark page, so it turns into the spotlight version there, as the guide asks on dark grounds.
  mark: {
    tile: 'fill-[#16130F] dark:fill-[#FFB627]',
    head: 'fill-[#FFB627] dark:fill-[#16130F]',
    arms: 'stroke-[#FFB627] dark:stroke-[#16130F]',
    spark: true,
  },
  // rt-mark-spotlight: on the stage and on dark photography.
  spotlight: {
    tile: 'fill-[#FFB627]',
    head: 'fill-[#16130F]',
    arms: 'stroke-[#16130F]',
    spark: true,
  },
  // rt-figure-ink: one colour, for stamps and watermarks. Never on the stage.
  ink: { tile: null, head: 'fill-current', arms: 'stroke-current', spark: false },
};

/**
 * A figure with arms raised under a spotlight: a marigold head and V on the stage, and the
 * ember spark that comes with being noticed. Decorative; the name sits beside it.
 */
export function BrandMark({
  version = 'mark',
  className,
}: {
  readonly version?: MarkVersion;
  readonly className?: string;
}) {
  const { tile, head, arms, spark } = VERSIONS[version];
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className={cn('size-8 shrink-0', className)}>
      {tile ? <rect width="512" height="512" rx="127" className={tile} /> : null}
      <circle cx="256" cy="169" r="59" className={head} />
      <path
        d="M128 236 256 388 384 236"
        fill="none"
        className={arms}
        strokeWidth="48"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {spark ? <circle cx="418" cy="93" r="20.5" fill="#E8492B" /> : null}
    </svg>
  );
}

/**
 * The lockup: the mark and "Raising Talents" in Archivo Narrow 700, -0.01em. The mark is 1.4
 * times the cap height, so it scales with the text size the caller sets. On the stage, use the
 * spotlight version.
 */
export function BrandLockup({
  version = 'mark',
  className,
  nameClassName,
}: {
  readonly version?: MarkVersion;
  readonly className?: string;
  readonly nameClassName?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-[0.45em] font-display font-bold tracking-[-0.01em] whitespace-nowrap',
        className,
      )}
    >
      <BrandMark version={version} className="size-[1.4em]" />
      <span className={nameClassName}>{t('common.appName')}</span>
    </span>
  );
}
