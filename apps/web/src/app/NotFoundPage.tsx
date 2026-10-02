import { Link } from 'react-router';
import { t } from '../i18n';
import { Page } from '../shared/ui/Page';

export function NotFoundPage() {
  return (
    <Page title={t('notFound.title')} subtitle={t('notFound.body')}>
      <Link className="button button--primary" to="/">
        {t('notFound.home')}
      </Link>
    </Page>
  );
}
