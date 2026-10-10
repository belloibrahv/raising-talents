import type { ImageUrls } from '@rt/contracts';
import { cn } from '@/lib/utils';

const SIZES = {
  sm: 'size-9 text-sm',
  md: 'size-11 text-base',
  lg: 'size-16 text-2xl',
  xl: 'size-24 text-4xl sm:size-36 sm:text-6xl',
} as const;

interface AvatarProps {
  readonly name: string;
  readonly urls: ImageUrls | null;
  readonly size?: keyof typeof SIZES;
  /** The brand ring: this is a person whose work you can open. */
  readonly ring?: boolean;
  readonly className?: string;
}

/** A person's photo, or their initial on the stage colour. Decorative: the name sits beside it. */
export function Avatar({ name, urls, size = 'md', ring = false, className }: AvatarProps) {
  const face = urls ? (
    <img
      className="size-full rounded-full bg-muted object-cover"
      src={size === 'xl' ? urls.medium : urls.small}
      alt=""
      loading="lazy"
      decoding="async"
    />
  ) : (
    <span
      aria-hidden="true"
      className="grid size-full place-items-center rounded-full bg-stage font-display font-bold text-stage-foreground"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
  return (
    <span
      className={cn('block shrink-0 rounded-full', SIZES[size], ring && 'ring-brand', className)}
    >
      {face}
    </span>
  );
}
