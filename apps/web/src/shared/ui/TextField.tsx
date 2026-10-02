import { useId, useState, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { t } from '../../i18n';

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
  const inputClasses = ['field__input', action ? 'field__input--with-action' : '', inputClassName];
  return (
    <div className={['field', className].filter(Boolean).join(' ')}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="field__control">
        <input
          {...input}
          ref={ref}
          id={id}
          className={inputClasses.filter(Boolean).join(' ')}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {action}
      </div>
      {hint ? (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="field__error">
          {error}
        </p>
      ) : null}
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
          className="field__action"
          aria-pressed={visible}
          aria-label={visible ? t('common.hidePassword') : t('common.showPassword')}
          onClick={() => {
            setVisible((value) => !value);
          }}
        >
          {visible ? t('common.hide') : t('common.show')}
        </button>
      }
    />
  );
}
