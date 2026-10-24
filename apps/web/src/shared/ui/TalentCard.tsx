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
  level = 'h3',
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
  /** The name's heading level, to follow the page's outline. */
  readonly level?: 'h2' | 'h3';
  readonly className?: string;
}) {
  const Heading = level;
  return (
    <article
      className={cn(
        'relative flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground',
        className,
      )}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-stage">
        {media ?? <StagePlaceholder caption={caption} className="size-full" />}
        {tag ? <StageTag className="absolute top-3 left-3">{tag}</StageTag> : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <Heading className="m-0 font-display text-xl leading-tight font-bold tracking-[-0.01em]">
          {name}
        </Heading>
        <p className="m-0 text-sm text-muted-foreground">{detail}</p>
        {meta || action ? (
          <div className="mt-auto flex items-center justify-between gap-3 pt-3">
            {meta ? <span className="text-sm text-muted-foreground">{meta}</span> : <span />}
            {action ? <span className="relative z-10">{action}</span> : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
