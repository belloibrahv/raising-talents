import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Where a photo will go, until there is one: the stage with a soft radial spotlight, and a
 * caption naming the photo needed (brand guide sections 07 and 09). Decorative.
 */
export function StagePlaceholder({
  caption,
  className,
}: {
  readonly caption?: string;
  readonly className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'grid place-items-center bg-stage stage-glow p-6 text-center text-xs text-stage-ink-muted',
        className,
      )}
    >
      {caption ? <span className="max-w-[18ch]">{caption}</span> : null}
    </div>
  );
}

/** A small dark tag on media: "ATHLETE · 100M". Label type, warm white on the stage. */
export function StageTag({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-stage/80 px-2.5 py-1 text-[0.6875rem] leading-none font-semibold tracking-[0.06em] text-stage-ink uppercase',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The small uppercase line above a headline: "DISCOVER", "HOW IT WORKS". */
export function Eyebrow({
  children,
  onStage = false,
  className,
}: {
  readonly children: ReactNode;
  readonly onStage?: boolean;
  readonly className?: string;
}) {
  return (
    <p
      className={cn(
        'm-0 label-caps',
        onStage ? 'text-spotlight' : 'text-spotlight-text',
        className,
      )}
    >
      {children}
    </p>
  );
}
