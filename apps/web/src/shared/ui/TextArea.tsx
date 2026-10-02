import { useId, type Ref, type TextareaHTMLAttributes } from 'react';
import { t } from '../../i18n';

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
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <textarea
        {...input}
        ref={ref}
        id={id}
        value={value}
        maxLength={maxLength}
        className="field__input field__textarea"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />
      {hint ? (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      ) : null}
      <p id={`${id}-count`} className="field__hint" aria-live="polite">
        {t('onboarding.story.counter', { count: value.length, max: maxLength })}
      </p>
      {error ? (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
