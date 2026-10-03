import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Slot } from 'radix-ui';

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full text-base font-semibold whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/30',
        outline: 'border-2 border-primary bg-background text-foreground hover:bg-accent',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        spotlight: 'bg-spotlight text-spotlight-foreground hover:bg-spotlight/85',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'h-auto px-0 text-foreground underline underline-offset-4 hover:decoration-2',
      },
      size: {
        default: 'h-12 px-6 has-[>svg]:px-5',
        xs: "h-8 gap-1 px-3 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-10 gap-1.5 px-4 text-sm has-[>svg]:px-3 [&_svg:not([class*='size-'])]:size-4",
        lg: 'h-14 px-8 text-lg has-[>svg]:px-6',
        icon: 'size-12',
        'icon-xs': "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        'icon-sm': 'size-10',
        'icon-lg': 'size-14',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : 'button';

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
