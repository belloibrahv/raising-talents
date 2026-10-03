import { t } from '../../i18n';

const clock = new Intl.DateTimeFormat('en-NG', { hour: 'numeric', minute: '2-digit' });
const dayMonth = new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short' });
const fullDay = new Intl.DateTimeFormat('en-NG', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** The time today, otherwise the date: what a list of chats shows. */
export function shortTime(iso: string, now = new Date()): string {
  const date = new Date(iso);
  return startOfDay(date) === startOfDay(now) ? clock.format(date) : dayMonth.format(date);
}

export const timeOfDay = (iso: string): string => clock.format(new Date(iso));

/** The heading between days in a thread. */
export function dayHeading(iso: string, now = new Date()): string {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(iso))) / 86_400_000);
  if (days === 0) return t('messages.today');
  if (days === 1) return t('messages.yesterday');
  return fullDay.format(new Date(iso));
}

export const dayKey = (iso: string): number => startOfDay(new Date(iso));
