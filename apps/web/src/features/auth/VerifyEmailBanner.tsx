import { MailWarning, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { t } from '../../i18n';
import { buttonLink } from '../../shared/ui/Button';
import { useSession } from './use-auth';

const HIDDEN_KEY = 'rt:verify-banner-hidden';

/** Remembers who hid it, so someone else signing in on this tab still sees their own. */
const wasHiddenBy = (userId: string): boolean => {
  try {
    return sessionStorage.getItem(HIDDEN_KEY) === userId;
  } catch {
    return false;
  }
};

/**
 * A calm, persistent nudge while the email is unverified (ADR-037). It says what verifying
 * unlocks for this person, and can be hidden until the next visit; the red dot on the
 * Account tab stays until the email is verified.
 */
export function VerifyEmailBanner() {
  const me = useSession().me;
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);
  if (!me || me.emailVerified || hiddenFor === me.id || wasHiddenBy(me.id)) return null;
  const message =
    me.role === 'talent'
      ? t('verifyBanner.talent')
      : me.role === 'agent'
        ? t('verifyBanner.agent')
        : t('verifyBanner.other');
  return (
    <section
      aria-label={t('verifyBanner.region')}
      className="border-b border-spotlight/60 bg-spotlight/15 text-foreground"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <span className="relative grid size-9 shrink-0 place-items-center rounded-full bg-spotlight text-spotlight-foreground">
          <MailWarning aria-hidden="true" className="size-5" />
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-destructive ring-2 ring-background"
          />
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium">{message}</p>
        <Link className={buttonLink('primary', 'sm')} to="/verify-email">
          {t('verifyBanner.action')}
        </Link>
        <button
          type="button"
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={t('verifyBanner.dismiss')}
          onClick={() => {
            try {
              sessionStorage.setItem(HIDDEN_KEY, me.id);
            } catch {
              // Private mode without storage: hidden for this page only.
            }
            setHiddenFor(me.id);
          }}
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    </section>
  );
}
