import { Link } from 'react-router';
import { t } from '../i18n';
import { Page } from '../shared/ui/Page';
import { buttonLink } from '../shared/ui/Button';

export function NotFoundPage() {
  return (
    <Page title={t('notFound.title')} subtitle={t('notFound.body')}>
      <Link className={buttonLink('primary')} to="/">
        {t('notFound.home')}
      </Link>
    </Page>
  );
}
