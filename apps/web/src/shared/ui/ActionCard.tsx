import { ChevronRight, type LucideIcon } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/** A dashboard destination: the whole card is one link, so the target is large and clear. */
export function ActionCard({
  to,
  icon: Icon,
  title,
  description,
  featured = false,
}: {
  readonly to: string;
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly featured?: boolean;
}) {
  const id = useId();
  return (
    <Link
      to={to}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      className={cn(
        'group flex items-center gap-4 rounded-2xl border p-5 no-underline shadow-xs transition-all hover:-translate-y-0.5 hover:shadow-md',
        featured
          ? 'border-primary bg-primary text-primary-foreground'
          : 'bg-card text-card-foreground hover:border-input',
      )}
    >
      <span
        className={cn(
          'grid size-12 shrink-0 place-items-center rounded-xl',
          featured ? 'bg-spotlight text-spotlight-foreground' : 'bg-muted text-foreground',
        )}
      >
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <span className="grid flex-1 gap-0.5">
        <span id={`${id}-title`} className="text-lg font-semibold">
          {title}
        </span>
        <span
          id={`${id}-description`}
          className={cn(
            'text-sm',
            featured ? 'text-primary-foreground/80' : 'text-muted-foreground',
          )}
        >
          {description}
        </span>
      </span>
      <ChevronRight
        aria-hidden="true"
        className="size-5 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
