import { NavLink } from 'react-router';
import { t } from '../../i18n';

/** Switches between the queues. Links, so each queue has its own address. */
export function ModerationTabs() {
  return (
    <nav aria-label={t('moderation.tabs')}>
      <ul className="row" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        <li>
          <NavLink className="button button--secondary button--small" to="/moderation" end>
            {t('moderation.mediaTab')}
          </NavLink>
        </li>
        <li>
          <NavLink className="button button--secondary button--small" to="/moderation/agents">
            {t('moderation.agentsTab')}
          </NavLink>
        </li>
        <li>
          <NavLink className="button button--secondary button--small" to="/moderation/reports">
            {t('moderation.reportsTab')}
          </NavLink>
        </li>
      </ul>
    </nav>
  );
}
