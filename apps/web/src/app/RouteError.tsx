import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useRouteError } from 'react-router';
import { t } from '../i18n';
import { NetworkError } from '../shared/api/api-error';
import { reportError } from '../shared/observability/error-reporting';
import { isStaleChunkError } from '../shared/observability/should-report';
import { Button, buttonLink } from '../shared/ui/Button';
import { EmptyState } from '../shared/ui/EmptyState';
import { Page } from '../shared/ui/Page';

/**
 * Shown when a screen fails to load or render, in place of the screen only, so the header
 * and navigation stay. A new release and a lost connection each get their own words.
 */
export function RouteError() {
  const error = useRouteError();
  useEffect(() => {
    reportError(error, { source: 'route' });
  }, [error]);

  const stale = isStaleChunkError(error);
  const offline = error instanceof NetworkError || !navigator.onLine;
  const title = stale
    ? t('routeError.updateTitle')
    : offline
      ? t('routeError.offlineTitle')
      : t('routeError.title');
  const body = stale
    ? t('routeError.updateBody')
    : offline
      ? t('routeError.offlineBody')
      : t('routeError.body');
  return (
    <Page title={title} documentTitle={title}>
      <EmptyState icon={stale ? RefreshCw : offline ? CloudOff : TriangleAlert} title={body}>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              window.location.reload();
            }}
          >
            {stale ? t('routeError.update') : t('routeError.retry')}
          </Button>
          <Link className={buttonLink('secondary')} to="/" reloadDocument>
            {t('routeError.home')}
          </Link>
        </div>
      </EmptyState>
    </Page>
  );
}
