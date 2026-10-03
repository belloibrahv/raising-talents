import * as React from 'react';
import { cn } from '@/lib/utils';
import { Progress as ProgressPrimitive } from 'radix-ui';

function Progress({
  className,
  value,
  max = 100,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  const percent = Math.min(100, Math.max(0, ((value ?? 0) / max) * 100));
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      max={max}
      className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="h-full w-full flex-1 rounded-full bg-primary transition-transform duration-300"
        style={{ transform: `translateX(-${String(100 - percent)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
