import { useId, type Ref } from 'react';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { t } from '../../i18n';
import { FieldError, FieldHint, labelClass } from '../../shared/ui/field-text';
import { digitsOnly, monthNames, type DateParts } from './date-of-birth';

interface DateOfBirthFieldProps {
  readonly value: DateParts;
  readonly onChange: (value: DateParts) => void;
  readonly hint?: string | undefined;
  readonly error?: string | undefined;
  readonly ref?: Ref<HTMLInputElement>;
}

const MONTHS = monthNames();

/**
 * Day, month by name, and year. A single typed date reads differently around the world
 * (3/4 is March in one country and April in another); a named month cannot be misread.
 */
export function DateOfBirthField({ value, onChange, hint, error, ref }: DateOfBirthFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const invalid = error ? true : undefined;
  return (
    <div role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy}>
      <div className="grid gap-2">
        <span id={`${id}-label`} className={labelClass}>
          {t('signUp.dateOfBirth')}
        </span>
        <div className="grid grid-cols-[4.5rem_1fr_6rem] gap-2">
          <Input
            ref={ref}
            aria-label={t('signUp.day')}
            aria-invalid={invalid}
            aria-describedby={errorId}
            placeholder={t('signUp.dayPlaceholder')}
            inputMode="numeric"
            autoComplete="bday-day"
            value={value.day}
            onChange={(event) => {
              onChange({ ...value, day: digitsOnly(event.target.value, 2) });
            }}
            required
          />
          <NativeSelect
            aria-label={t('signUp.month')}
            aria-invalid={invalid}
            autoComplete="bday-month"
            value={value.month}
            onChange={(event) => {
              onChange({ ...value, month: event.target.value });
            }}
            required
          >
            <NativeSelectOption value="">{t('signUp.month')}</NativeSelectOption>
            {MONTHS.map((name, index) => (
              <NativeSelectOption key={name} value={String(index + 1)}>
                {name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Input
            aria-label={t('signUp.year')}
            aria-invalid={invalid}
            placeholder={t('signUp.yearPlaceholder')}
            inputMode="numeric"
            autoComplete="bday-year"
            value={value.year}
            onChange={(event) => {
              onChange({ ...value, year: digitsOnly(event.target.value, 4) });
            }}
            required
          />
        </div>
        {hintId ? <FieldHint id={hintId}>{hint}</FieldHint> : null}
        {errorId ? <FieldError id={errorId}>{error}</FieldError> : null}
      </div>
    </div>
  );
}
