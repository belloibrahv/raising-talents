import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> {
  readonly label: ReactNode;
  readonly error?: string | undefined;
  readonly ref?: Ref<HTMLInputElement>;
}

export function Checkbox({ label, error, ref, ...input }: CheckboxProps) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="field">
      <div className="checkbox">
        <input
          {...input}
          ref={ref}
          id={id}
          type="checkbox"
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
        />
        <label htmlFor={id}>{label}</label>
      </div>
      {error ? (
        <p id={errorId} className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
