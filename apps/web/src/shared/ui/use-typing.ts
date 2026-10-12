import { useEffect, useState } from 'react';

const TEXT_ENTRY =
  'textarea, [contenteditable="true"], input:not([type=checkbox], [type=radio], [type=file], [type=range], [type=button], [type=submit], [type=color])';

/**
 * True while someone is typing on a touch screen, which is when the on-screen keyboard is up.
 * The tab bar steps aside then, so the keyboard does not push it over the field being filled in.
 */
export function useTyping(): boolean {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia('(pointer: coarse)').matches) return;
    const check = () => {
      setTyping(document.activeElement?.matches(TEXT_ENTRY) ?? false);
    };
    // Focus moving from one field to the next blurs first: wait for where it lands.
    const later = () => window.setTimeout(check, 0);
    document.addEventListener('focusin', check);
    document.addEventListener('focusout', later);
    return () => {
      document.removeEventListener('focusin', check);
      document.removeEventListener('focusout', later);
    };
  }, []);
  return typing;
}
