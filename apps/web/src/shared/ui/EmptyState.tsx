import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

/** Nothing to show yet: an icon, one line on why, and the way forward when there is one. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description?: string;
  readonly children?: ReactNode;
}) {
  return (
    <Empty className="rounded-2xl border border-dashed bg-muted/40 py-10">
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="size-12 rounded-full bg-background text-foreground shadow-xs"
        >
          <Icon aria-hidden="true" className="size-6" />
        </EmptyMedia>
        <EmptyTitle className="font-display text-lg font-semibold">{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
      {children ? <EmptyContent>{children}</EmptyContent> : null}
    </Empty>
  );
}
