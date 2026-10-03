import { useId } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { checkboxClass } from './Checkbox';
import { FieldError, FieldHint, labelClass } from './field-text';

interface Option {
  readonly value: string;
  readonly label: string;
}

interface ChoiceGroupProps {
  readonly legend: string;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly options: readonly Option[];
  readonly layout?: 'cards' | 'chips';
}

interface SingleProps extends ChoiceGroupProps {
  readonly multiple?: false;
  readonly value: string | null;
  readonly onChange: (value: string) => void;
}

interface MultipleProps extends ChoiceGroupProps {
  readonly multiple: true;
  readonly value: readonly string[];
  /** Further boxes are disabled once this many are ticked, so the limit is felt, not just told. */
  readonly max: number;
  readonly onChange: (value: readonly string[]) => void;
}

const radioClass =
  'mt-0.5 size-5 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-input bg-background transition-all checked:border-[6px] checked:border-primary';

/** Radios or checkboxes in a fieldset with a legend: one question, read as one group. */
export function ChoiceGroup(props: SingleProps | MultipleProps) {
  const id = useId();
  const describedBy = [props.hint ? `${id}-hint` : '', props.error ? `${id}-error` : '']
    .filter(Boolean)
    .join(' ');
  const chips = props.layout === 'chips';
  return (
    <fieldset
      className="m-0 grid min-w-0 gap-3 border-0 p-0"
      aria-describedby={describedBy || undefined}
    >
      <legend className={cn(labelClass, 'mb-1 p-0')}>{props.legend}</legend>
      {props.hint ? <FieldHint id={`${id}-hint`}>{props.hint}</FieldHint> : null}
      <div className={chips ? 'flex flex-wrap gap-2' : 'grid gap-2'}>
        {props.options.map((option) => {
          const checked = props.multiple
            ? props.value.includes(option.value)
            : props.value === option.value;
          const atLimit = props.multiple && !checked && props.value.length >= props.max;
          const input = (
            <input
              type={props.multiple ? 'checkbox' : 'radio'}
              name={id}
              value={option.value}
              checked={checked}
              disabled={atLimit}
              className={chips ? 'sr-only' : props.multiple ? checkboxClass : radioClass}
              onChange={() => {
                if (!props.multiple) {
                  props.onChange(option.value);
                  return;
                }
                props.onChange(
                  checked
                    ? props.value.filter((value) => value !== option.value)
                    : [...props.value, option.value],
                );
              }}
            />
          );
          return chips ? (
            <label
              key={option.value}
              className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border-2 border-input bg-background px-4 text-sm font-semibold transition-colors select-none hover:bg-accent has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-disabled:cursor-not-allowed has-disabled:opacity-50 has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
            >
              {input}
              {checked ? <Check aria-hidden="true" className="size-4" /> : null}
              <span className="choice__title">{option.label}</span>
            </label>
          ) : (
            <label
              key={option.value}
              className="flex min-h-14 cursor-pointer items-start gap-3 rounded-xl border-2 border-border bg-card px-4 py-3.5 transition-colors hover:border-input has-checked:border-primary has-checked:bg-accent has-disabled:cursor-not-allowed has-disabled:opacity-50"
            >
              {input}
              <span className="choice__title text-base font-semibold leading-snug">
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
      {props.error ? <FieldError id={`${id}-error`}>{props.error}</FieldError> : null}
    </fieldset>
  );
}
