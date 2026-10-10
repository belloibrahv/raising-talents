import { Check, ChevronsUpDown } from 'lucide-react';
import { useId, useMemo, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { FieldError, FieldHint, labelClass } from './field-text';

export interface ComboboxOption {
  readonly value: string;
  readonly label: string;
  /** Shown beside the label in a quieter tone: a region, a count. */
  readonly detail?: string | undefined;
  /** Other words that should find this option. */
  readonly keywords?: readonly string[] | undefined;
}

interface ComboboxProps {
  readonly label: string;
  readonly placeholder: string;
  readonly options: readonly ComboboxOption[];
  /** The chosen option's value, or '' for none. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly disabled?: boolean | undefined;
  /** Shown when typing matches nothing. */
  readonly emptyText: string;
  /** Lets "clear" be picked from the list, for filters. */
  readonly clearLabel?: string | undefined;
  readonly ref?: Ref<HTMLInputElement>;
  readonly className?: string;
}

/** Long lists are cut to what fits a short scroll; typing narrows the rest. */
const MAX_SHOWN = 60;

const fold = (text: string) => text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * An exact name or keyword first ("uk" is the United Kingdom, not Ukraine), then names that
 * start with the text, then names that contain it.
 */
export function filterOptions(
  options: readonly ComboboxOption[],
  text: string,
): readonly ComboboxOption[] {
  const needle = fold(text.trim());
  if (!needle) return options;
  const exact: ComboboxOption[] = [];
  const starts: ComboboxOption[] = [];
  const contains: ComboboxOption[] = [];
  for (const option of options) {
    const words = [option.label, ...(option.keywords ?? [])].map(fold);
    if (words.includes(needle)) exact.push(option);
    else if (words.some((word) => word.startsWith(needle))) starts.push(option);
    else if (words.some((word) => word.includes(needle))) contains.push(option);
  }
  return [...exact, ...starts, ...contains];
}

/**
 * A text field that filters a list as you type, for lists too long for a select
 * (countries, cities). Follows the ARIA combobox pattern: arrows move, Enter picks,
 * Escape closes, and leaving the field keeps the last choice.
 */
export function Combobox({
  label,
  placeholder,
  options,
  value,
  onChange,
  hint,
  error,
  disabled,
  emptyText,
  clearLabel,
  ref,
  className,
}: ComboboxProps) {
  const id = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const selected = options.find((option) => option.value === value);
  const [open, setOpen] = useState(false);
  // Null while the field shows the chosen option; text while the person is typing.
  const [text, setText] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const shown = useMemo(() => {
    const base: readonly ComboboxOption[] =
      clearLabel && value && !text ? [{ value: '', label: clearLabel }, ...options] : options;
    return filterOptions(base, text ?? '').slice(0, MAX_SHOWN);
  }, [options, text, clearLabel, value]);

  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const close = () => {
    setOpen(false);
    setText(null);
  };
  const pick = (option: ComboboxOption) => {
    onChange(option.value);
    close();
  };
  const move = (to: number) => {
    const next = Math.max(0, Math.min(shown.length - 1, to));
    setActive(next);
    listRef.current?.children[next]?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) setOpen(true);
      else move(active + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter' && open) {
      // Enter picks; it must not send the form while the list is open.
      event.preventDefault();
      const option = shown[active];
      if (option) pick(option);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      close();
    }
  };

  return (
    <div className={cn('grid gap-2', className)}>
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <Input
          ref={ref}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-activedescendant={open && shown[active] ? `${id}-option-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={placeholder}
          className="pr-10"
          value={text ?? selected?.label ?? ''}
          onChange={(event) => {
            setText(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={(event) => {
            // Typing replaces the current choice instead of adding to it.
            event.target.select();
            setOpen(true);
          }}
          onClick={() => {
            setOpen(true);
          }}
          onBlur={close}
          onKeyDown={onKeyDown}
        />
        <ChevronsUpDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          aria-label={label}
          hidden={!open}
          className="absolute inset-x-0 top-full z-40 m-0 mt-1.5 max-h-64 list-none overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
          // Keeps focus in the field, so a tap on an option is not lost to the blur.
          onMouseDown={(event) => {
            event.preventDefault();
          }}
        >
          {shown.map((option, index) => (
            <li
              key={option.value || 'clear'}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={option.value === value}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm',
                index === active && 'bg-accent text-accent-foreground',
              )}
              onMouseEnter={() => {
                setActive(index);
              }}
              onClick={() => {
                pick(option);
              }}
            >
              <span className="min-w-0 flex-1 truncate">
                <span className={cn(option.value === value && 'font-semibold')}>
                  {option.label}
                </span>
                {option.detail ? (
                  <span className="text-muted-foreground">{` · ${option.detail}`}</span>
                ) : null}
              </span>
              {option.value === value && value ? (
                <Check aria-hidden="true" className="size-4 shrink-0" />
              ) : null}
            </li>
          ))}
          {shown.length === 0 ? (
            <li role="presentation" className="px-3 py-3 text-sm text-muted-foreground">
              {emptyText}
            </li>
          ) : null}
        </ul>
      </div>
      {hintId ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
      {errorId ? <FieldError id={errorId}>{error}</FieldError> : null}
    </div>
  );
}
