import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useSession } from '../features/auth/use-auth';
import { t } from '../i18n';
import { areaFor, type AppArea } from '../shared/session/area';
import { Button } from '../shared/ui/Button';
import { FullScreenStatus } from '../shared/ui/FullScreenStatus';

export const HOME_OF: Record<AppArea, string> = {
  auth: '/welcome',
  verifyEmail: '/verify-email',
  chooseRole: '/choose-role',
  app: '/home',
};

interface AreaGateProps {
  /** The area this screen belongs to. Anyone in another area is sent to that area's start. */
  readonly area?: AppArea;
  readonly retry: () => void;
  readonly children?: ReactNode;
}

/** Onboarding is a strict order: verify the email, then choose a role, then the app opens. */
export function AreaGate({ area, retry, children }: AreaGateProps) {
  const { status, me } = useSession();
  const current = areaFor(status, me);
  if (status === 'unreachable') {
    return (
      <FullScreenStatus>
        <div className="stack">
          <h1>{t('restore.offlineTitle')}</h1>
          <p>{t('restore.offlineBody')}</p>
          <Button onClick={retry}>{t('common.tryAgain')}</Button>
        </div>
      </FullScreenStatus>
    );
  }
  if (current === null) return <FullScreenStatus />;
  if (current !== area) return <Navigate to={HOME_OF[current]} replace />;
  return <>{children}</>;
}
