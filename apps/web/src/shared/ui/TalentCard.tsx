import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { StagePlaceholder, StageTag } from './Stage';

/**
 * The talent card (brand guide section 09): 4:5 media on the stage with a discipline tag, the
 * name in Archivo Narrow 700, what they do and where in ink-muted, and a line for a count and an
 * action. Used on the website, in search results and in shortlists.
 */
export function TalentCard({
  name,
  detail,
  tag,
  media,
  caption,
  meta,
  action,
  className,
}: {
  readonly name: ReactNode;
  /** "Sprinter · Ibadan, Nigeria" */
  readonly detail: ReactNode;
  readonly tag?: ReactNode;
  /** The photo. Without one, the stage stands in, with the caption naming the photo needed. */
  readonly media?: ReactNode;
  readonly caption?: string;
  /** "2.4k followers" */
  readonly meta?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}) {
  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground',
        className,
      )}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-stage">
        {media ?? <StagePlaceholder caption={caption} className="size-full" />}
        {tag ? <StageTag className="absolute top-3 left-3">{tag}</StageTag> : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="m-0 font-display text-xl leading-tight font-bold tracking-[-0.01em]">
          {name}
        </h3>
        <p className="m-0 text-sm text-muted-foreground">{detail}</p>
        {meta || action ? (
          <div className="mt-auto flex items-center justify-between gap-3 pt-3">
            {meta ? <span className="text-sm text-muted-foreground">{meta}</span> : <span />}
            {action}
          </div>
        ) : null}
      </div>
    </article>
  );
}
