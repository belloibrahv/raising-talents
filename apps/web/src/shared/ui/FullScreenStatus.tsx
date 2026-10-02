import type { ReactNode } from 'react';
import { t } from '../../i18n';

/** For the moments before any screen can show: restoring the session, or offline at start-up. */
export function FullScreenStatus({ children }: { readonly children?: ReactNode }) {
  return (
    <main id="main" className="centered" aria-busy={children ? undefined : true}>
      {children ?? (
        <div role="status">
          <span className="spinner" aria-hidden="true" />
          <span className="visually-hidden">{t('common.loading')}</span>
        </div>
      )}
    </main>
  );
}
