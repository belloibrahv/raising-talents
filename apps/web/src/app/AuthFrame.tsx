import type { ReactNode } from 'react';
import { BadgeCheck, EyeOff, Hand } from 'lucide-react';
import { Link } from 'react-router';
import { t } from '../i18n';
import { BrandMark } from '../shared/ui/BrandMark';

const POINTS = [
  { key: 'verified', icon: BadgeCheck },
  { key: 'control', icon: Hand },
  { key: 'private', icon: EyeOff },
] as const;

/**
 * Sign-up, sign-in and the steps before the app. Phones get the form alone; wide screens
 * add the stage beside it, with the reasons to trust the place.
 */
export function AuthFrame({ children }: { readonly children: ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-muted/60 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:bg-background">
      <div className="flex min-h-dvh flex-col">
        <header className="mx-auto flex h-16 w-full max-w-xl items-center px-4 sm:px-6">
          <Link
            to="/welcome"
            className="flex items-center gap-2.5 font-display text-lg font-bold no-underline"
          >
            <BrandMark />
            {t('common.appName')}
          </Link>
        </header>
        <div className="flex flex-1 flex-col lg:justify-center [&>main]:pb-10 sm:[&>main>div]:rounded-3xl sm:[&>main>div]:border sm:[&>main>div]:bg-card sm:[&>main>div]:p-10 sm:[&>main>div]:shadow-sm lg:[&>main>div]:border-0 lg:[&>main>div]:bg-transparent lg:[&>main>div]:p-0 lg:[&>main>div]:shadow-none">
          {children}
        </div>
      </div>
      <aside
        className="sticky top-0 hidden h-dvh flex-col justify-between overflow-hidden bg-stage p-12 text-stage-foreground stage-glow lg:flex"
        aria-label={t('auth.panelLabel')}
      >
        <p className="m-0 inline-flex w-fit items-center gap-2 rounded-full border border-stage-foreground/20 px-3 py-1 text-sm text-stage-foreground/85">
          <span className="size-2 rounded-full bg-spotlight" aria-hidden="true" />
          {t('welcome.eyebrow')}
        </p>
        <div className="grid max-w-md gap-8">
          <p className="m-0 font-display text-4xl leading-tight font-bold text-balance xl:text-5xl">
            {t('auth.panelTitle')}
          </p>
          <ul className="m-0 grid list-none gap-5 p-0">
            {POINTS.map(({ key, icon: Icon }) => (
              <li key={key} className="flex items-start gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-stage-foreground/10 text-spotlight">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="grid gap-0.5">
                  <span className="font-semibold">{t(`welcome.safety.${key}`)}</span>
                  <span className="text-sm text-stage-foreground/70">
                    {t(`welcome.safety.${key}Body`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className="m-0 text-sm text-stage-foreground/60">{t('welcome.footer.made')}</p>
      </aside>
    </div>
  );
}
