import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The label's look, shared by every field so a form reads as one piece. */
export const labelClass = 'text-sm font-semibold text-foreground';

export function FieldHint({ id, children }: { readonly id: string; readonly children: ReactNode }) {
  return (
    <p id={id} className="text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** Errors carry an icon as well as colour, so they do not rely on colour alone. */
export function FieldError({
  id,
  children,
  className,
}: {
  readonly id: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <p
      id={id}
      className={cn('flex items-start gap-1.5 text-sm font-medium text-destructive', className)}
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
