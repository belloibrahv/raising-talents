import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { t } from '../i18n';
import { BrandMark } from '../shared/ui/BrandMark';

/** Sign-up, sign-in and the steps before the app: the brand above, the form on a card. */
export function AuthFrame({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-muted/60">
      <header className="mx-auto flex h-16 w-full max-w-xl items-center px-4 sm:px-6">
        <Link
          to="/welcome"
          className="flex items-center gap-2.5 font-display text-lg font-bold no-underline"
        >
          <BrandMark />
          {t('common.appName')}
        </Link>
      </header>
      <div className="flex flex-1 flex-col [&>main]:pb-10 sm:[&>main>div]:rounded-3xl sm:[&>main>div]:border sm:[&>main>div]:bg-card sm:[&>main>div]:p-10 sm:[&>main>div]:shadow-sm">
        {children}
      </div>
    </div>
  );
}
