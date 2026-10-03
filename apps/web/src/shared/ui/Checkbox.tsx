import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react';
import { FieldError } from './field-text';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> {
  readonly label: ReactNode;
  readonly error?: string | undefined;
  readonly ref?: Ref<HTMLInputElement>;
}

/** A native checkbox in shadcn's style: forms, labels and screen readers work as browsers intend. */
export const checkboxClass =
  'peer mt-0.5 size-5 shrink-0 cursor-pointer appearance-none rounded-[5px] border-2 border-input bg-background transition-colors checked:border-primary checked:bg-primary checked:bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27white%27%20stroke-width%3D%273.5%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27M20%206%209%2017l-5-5%27/%3E%3C/svg%3E")] bg-center bg-no-repeat [background-size:80%] aria-invalid:border-destructive dark:checked:bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2024%2024%27%20fill%3D%27none%27%20stroke%3D%27%231c1a3d%27%20stroke-width%3D%273.5%27%20stroke-linecap%3D%27round%27%20stroke-linejoin%3D%27round%27%3E%3Cpath%20d%3D%27M20%206%209%2017l-5-5%27/%3E%3C/svg%3E")]';

export function Checkbox({ label, error, ref, ...input }: CheckboxProps) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="grid gap-2">
      <div className="flex items-start gap-3">
        <input
          {...input}
          ref={ref}
          id={id}
          type="checkbox"
          className={checkboxClass}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
        />
        <label htmlFor={id} className="cursor-pointer text-base leading-snug">
          {label}
        </label>
      </div>
      {errorId ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
