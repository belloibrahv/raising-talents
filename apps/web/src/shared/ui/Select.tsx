import { useId, type Ref, type SelectHTMLAttributes } from 'react';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { FieldError, labelClass } from './field-text';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'size'> {
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
    <div className="grid gap-2">
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <NativeSelect
        {...select}
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        <NativeSelectOption value="">{placeholder}</NativeSelectOption>
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {error ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
    </div>
  );
}
