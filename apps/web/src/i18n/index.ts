import en from './en.json';

type Copy = typeof en;
type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type CopyKey = Leaves<Copy>;

/**
 * Looks up a line of copy and fills in {placeholders}.
 * English only for now. The JSON shape is ready for a second language file.
 */
export function t(key: CopyKey, values: Record<string, string | number> = {}): string {
  const text = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], en);
  if (typeof text !== 'string') return key;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}
