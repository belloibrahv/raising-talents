/** Names that would let someone pose as the platform or collide with app routes. */
const RESERVED = new Set([
  'admin',
  'administrator',
  'support',
  'help',
  'raisingtalents',
  'raising_talents',
  'raising.talents',
  'official',
  'moderator',
  'staff',
  'team',
  'security',
  'api',
  'app',
  'me',
  'settings',
  'talents',
  'agents',
  'search',
  'feed',
  'inbox',
  'notifications',
  'verify',
  'verified',
  'login',
  'signin',
  'signup',
]);

export const isReservedHandle = (handle: string): boolean => RESERVED.has(handle.toLowerCase());

/**
 * Turns a display name into a handle candidate: "Amaka Okafor" becomes "amaka.okafor".
 * Letters outside a to z are dropped, so names in other scripts fall back to "talent".
 */
export function handleFromName(displayName: string): string {
  const base = displayName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 24)
    .replace(/\.+$/g, '');
  return base.length >= 3 ? base : 'talent';
}
