import { cn } from '@/lib/utils';
import { Loader2Icon } from 'lucide-react';

/** Decorative. Callers announce loading in words, in the reader's language. */
function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2Icon aria-hidden="true" className={cn('size-5 animate-spin', className)} {...props} />
  );
}

export { Spinner };
