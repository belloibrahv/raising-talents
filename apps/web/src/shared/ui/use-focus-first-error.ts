import { useEffect, useRef, type RefObject } from 'react';

/**
 * After a failed submit, moves focus to the first field marked invalid, so keyboard
 * and screen reader users land on the problem instead of hunting for it.
 */
export function useFocusFirstError(errors: object): RefObject<HTMLFormElement | null> {
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (Object.keys(errors).length === 0) return;
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);
  return form;
}
