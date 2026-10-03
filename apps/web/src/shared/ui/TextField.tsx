import { useId, useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { FieldError, FieldHint, labelClass } from './field-text';

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly ref?: Ref<HTMLInputElement>;
  /** A button inside the field, such as show password. */
  readonly action?: ReactNode;
  readonly inputClassName?: string;
}

/** A labelled input. The hint and the error are tied to it, so screen readers read them with it. */
export function TextField({
  label,
  hint,
  error,
  ref,
  action,
  inputClassName,
  className,
  ...input
}: TextFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('grid gap-2', className)}>
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <Input
          {...input}
          ref={ref}
          id={id}
          className={cn(action && 'pr-24', inputClassName)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {action ? (
          <div className="absolute inset-y-0 right-1 flex items-center">{action}</div>
        ) : null}
      </div>
      {hintId ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
      {errorId ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}

/** A password field with a show and hide toggle, so people on phones can check what they typed. */
export function PasswordField(props: Omit<TextFieldProps, 'type' | 'action'>) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      action={
        <button
          type="button"
          className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-foreground hover:bg-accent"
          aria-pressed={visible}
          aria-label={visible ? t('common.hidePassword') : t('common.showPassword')}
          onClick={() => {
            setVisible((value) => !value);
          }}
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="size-4" />
          ) : (
            <Eye aria-hidden="true" className="size-4" />
          )}
          {visible ? t('common.hide') : t('common.show')}
        </button>
      }
    />
  );
}
