import type { ReactNode } from 'react';
import { Spinner } from '@/components/ui/spinner';
import { t } from '../../i18n';

/** For the moments before any screen can show: restoring the session, or offline at start-up. */
export function FullScreenStatus({ children }: { readonly children?: ReactNode }) {
  return (
    <main
      id="main"
      className="grid min-h-dvh place-items-center p-6 text-center"
      aria-busy={children ? undefined : true}
    >
      {children ?? (
        <div role="status" className="text-muted-foreground">
          <Spinner className="size-8" />
          <span className="sr-only">{t('common.loading')}</span>
        </div>
      )}
    </main>
  );
}
