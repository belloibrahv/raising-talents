import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Slot } from 'radix-ui';

const buttonVariants = cva(
  // Pills in Archivo 600 (brand guide section 09). Focus uses the global 2px ring, offset 2px.
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full text-base font-semibold whitespace-nowrap transition-[color,background-color,border-color,transform] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-5",
  {
    variants: {
      variant: {
        // The one action on a screen: spotlight, with ink text.
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        // Destructive actions are a red outline, never a red fill.
        destructive:
          'border-[1.5px] border-destructive bg-transparent text-destructive hover:bg-destructive-surface',
        // Every other action. It takes the colour of the text around it, so it reads in ink on
        // paper and in warm white on the stage.
        outline: 'border-[1.5px] border-current bg-transparent hover:bg-current/10',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        // An action that is on: Following, Saved. Filled in ink, as in the designs.
        ink: 'bg-foreground text-background hover:bg-foreground/90',
        spotlight: 'bg-spotlight text-spotlight-foreground hover:bg-spotlight/90',
        ghost: 'hover:bg-current/10',
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
