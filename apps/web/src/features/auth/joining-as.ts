import type { SelectableRole } from '@rt/contracts';

const KEY = 'rt.joining-as';

const isRole = (value: string | null): value is SelectableRole =>
  value === 'talent' || value === 'agent';

/** The role in a "Join as ..." link: /sign-up?as=talent. */
export const roleFromLink = (search: URLSearchParams): SelectableRole | null => {
  const value = search.get('as');
  return isRole(value) ? value : null;
};

/**
 * What someone said they are joining as, kept for this tab until the account has a role,
 * so they are asked once: on the way in, not again after signing up.
 */
export const joiningAs = {
  get(): SelectableRole | null {
    try {
      const value = sessionStorage.getItem(KEY);
      return isRole(value) ? value : null;
    } catch {
      return null;
    }
  },
  set(role: SelectableRole | null): void {
    try {
      if (role) sessionStorage.setItem(KEY, role);
      else sessionStorage.removeItem(KEY);
    } catch {
      // Private browsing may refuse storage: they are asked on the next screen instead.
    }
  },
};
