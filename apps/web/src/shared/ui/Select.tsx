import { useId, type Ref, type SelectHTMLAttributes } from 'react';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  readonly label: string;
  readonly placeholder: string;
  readonly options: readonly { value: string; label: string }[];
  readonly error?: string | undefined;
  readonly ref?: Ref<HTMLSelectElement>;
}

/** A native select: the phone's own picker is the most usable one there is. */
export function Select({ label, placeholder, options, error, ref, ...select }: SelectProps) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select
        {...select}
        ref={ref}
        id={id}
        className="field__input field__select"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
