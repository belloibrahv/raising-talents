import type { ButtonHTMLAttributes } from 'react';
import { t } from '../../i18n';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: 'primary' | 'secondary' | 'text';
  /** Shows a spinner, keeps the label for screen readers and blocks double submits. */
  readonly loading?: boolean;
}

export function Button({
  variant = 'primary',
  loading = false,
  disabled,
  children,
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={['button', `button--${variant}`, className].filter(Boolean).join(' ')}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : null}
      {children}
      {loading ? <span className="visually-hidden">{t('common.loading')}</span> : null}
    </button>
  );
}
