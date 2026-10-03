import { useId } from 'react';

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

/** Radios or checkboxes in a fieldset with a legend: one question, read as one group. */
export function ChoiceGroup(props: SingleProps | MultipleProps) {
  const id = useId();
  const describedBy = [props.hint ? `${id}-hint` : '', props.error ? `${id}-error` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <fieldset
      className={`choices choices--${props.layout ?? 'cards'}`}
      aria-describedby={describedBy || undefined}
    >
      <legend className="field__label">{props.legend}</legend>
      {props.hint ? (
        <p id={`${id}-hint`} className="field__hint">
          {props.hint}
        </p>
      ) : null}
      <div className="choices__options">
        {props.options.map((option) => {
          const checked = props.multiple
            ? props.value.includes(option.value)
            : props.value === option.value;
          const atLimit = props.multiple && !checked && props.value.length >= props.max;
          return (
            <label key={option.value} className="choice">
              <input
                type={props.multiple ? 'checkbox' : 'radio'}
                name={id}
                value={option.value}
                checked={checked}
                disabled={atLimit}
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
              <span className="choice__title">{option.label}</span>
            </label>
          );
        })}
      </div>
      {props.error ? (
        <p id={`${id}-error`} className="field__error">
          {props.error}
        </p>
      ) : null}
    </fieldset>
  );
}
