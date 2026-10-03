import { Link } from 'react-router';
import { t } from '../../i18n';
import { Page } from '../../shared/ui/Page';

export function WelcomePage() {
  return (
    <Page
      title={t('welcome.headline')}
      documentTitle={t('common.appName')}
      subtitle={t('welcome.body')}
      className="welcome"
      titleClassName="welcome__headline"
      hero={<div className="welcome__spotlight" aria-hidden="true" />}
    >
      <nav className="stack welcome__actions" aria-label={t('titles.welcome')}>
        <Link className="button button--primary" to="/sign-up">
          {t('welcome.createAccount')}
        </Link>
        <Link className="button button--secondary" to="/sign-in">
          {t('welcome.signIn')}
        </Link>
      </nav>
    </Page>
  );
}
