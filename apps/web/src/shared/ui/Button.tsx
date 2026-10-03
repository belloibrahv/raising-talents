import type { ComponentProps } from 'react';
import { Button as UiButton, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';
import { t } from '../../i18n';

const VARIANTS = {
  primary: 'default',
  secondary: 'outline',
  text: 'link',
  quiet: 'ghost',
  danger: 'destructive',
  spotlight: 'spotlight',
} as const;

interface ButtonProps extends Omit<ComponentProps<typeof UiButton>, 'variant'> {
  readonly variant?: keyof typeof VARIANTS;
  /** Shows a spinner, keeps the label for screen readers and blocks double submits. */
  readonly loading?: boolean;
}

/** The app's button: shadcn's, with the brand's names for its variants and a loading state. */
export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <UiButton
      {...rest}
      type={type}
      variant={VARIANTS[variant]}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
    >
      {loading ? <Spinner aria-hidden="true" /> : null}
      {children}
      {loading ? <span className="sr-only">{t('common.loading')}</span> : null}
    </UiButton>
  );
}

/** For links that look like buttons: navigation stays a link, so it opens in a new tab and reads as one. */
export function buttonLink(
  variant: keyof typeof VARIANTS = 'primary',
  size: 'default' | 'sm' | 'lg' = 'default',
): string {
  return cn(buttonVariants({ variant: VARIANTS[variant], size }), 'no-underline');
}
