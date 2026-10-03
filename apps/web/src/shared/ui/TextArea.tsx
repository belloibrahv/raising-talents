import { useId, type Ref, type TextareaHTMLAttributes } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { t } from '../../i18n';
import { FieldError, FieldHint, labelClass } from './field-text';

interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'value'> {
  readonly label: string;
  readonly value: string;
  readonly maxLength: number;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly ref?: Ref<HTMLTextAreaElement>;
}

/** A labelled text area with a live count, announced politely so it does not interrupt typing. */
export function TextArea({ label, hint, error, maxLength, value, ref, ...input }: TextAreaProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', `${id}-count`, error ? `${id}-error` : '']
    .filter(Boolean)
    .join(' ');
  const nearLimit = value.length >= maxLength * 0.9;
  return (
    <div className="grid gap-2">
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <Textarea
        {...input}
        ref={ref}
        id={id}
        value={value}
        maxLength={maxLength}
        className="min-h-28"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {hint ? <FieldHint id={`${id}-hint`}>{hint}</FieldHint> : null}
      <p
        id={`${id}-count`}
        className={cn(
          'text-right text-xs tabular-nums text-muted-foreground',
          nearLimit && 'font-semibold text-foreground',
        )}
        aria-live="polite"
      >
        {t('onboarding.story.counter', { count: value.length, max: maxLength })}
      </p>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}
