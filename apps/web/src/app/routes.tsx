import { lazy, Suspense, type ReactNode } from 'react';
import { Outlet, useOutletContext, type RouteObject } from 'react-router';
import { useRestoreSession } from '../features/auth/use-auth';
import { WelcomePage } from '../features/auth/WelcomePage';
import { FullScreenStatus } from '../shared/ui/FullScreenStatus';
import { t } from '../i18n';
import { NetworkBanner } from '../shared/pwa/NetworkBanner';
import type { AppArea } from '../shared/session/area';
import { AppLayout } from './AppLayout';
import { AreaGate } from './AreaGate';
import { NotFoundPage } from './NotFoundPage';

// The welcome screen ships in the first download; every other screen loads when first opened.
const SignUpPage = lazy(() =>
  import('../features/auth/SignUpPage').then((m) => ({ default: m.SignUpPage })),
);
const SignInPage = lazy(() =>
  import('../features/auth/SignInPage').then((m) => ({ default: m.SignInPage })),
);
const VerifyEmailPage = lazy(() =>
  import('../features/auth/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })),
);
const ChooseRolePage = lazy(() =>
  import('../features/auth/ChooseRolePage').then((m) => ({ default: m.ChooseRolePage })),
);
const TalentOnboardingPage = lazy(() =>
  import('../features/profile/TalentOnboardingPage').then((m) => ({
    default: m.TalentOnboardingPage,
  })),
);
const AgentOnboardingPage = lazy(() =>
  import('../features/profile/AgentOnboardingPage').then((m) => ({
    default: m.AgentOnboardingPage,
  })),
);
const PortfolioPage = lazy(() =>
  import('../features/portfolio/PortfolioPage').then((m) => ({ default: m.PortfolioPage })),
);
const TalentProfilePage = lazy(() =>
  import('../features/talents/TalentProfilePage').then((m) => ({ default: m.TalentProfilePage })),
);
const HomePage = lazy(() =>
  import('../features/auth/HomePage').then((m) => ({ default: m.HomePage })),
);

/** Around every screen: the skip link, the offline banner, the update prompt and the session restore. */
function Shell({ updatePrompt }: { readonly updatePrompt: ReactNode }) {
  const { retry } = useRestoreSession();
  return (
    <>
      <a className="skip-link" href="#main">
        {t('common.skipToContent')}
      </a>
      <NetworkBanner />
      <Suspense fallback={<FullScreenStatus />}>
        <Outlet context={retry} />
      </Suspense>
      {updatePrompt}
    </>
  );
}

function Gate({ area, children }: { readonly area?: AppArea; readonly children?: ReactNode }) {
  const retry = useOutletContext<() => void>();
  return (
    <AreaGate area={area} retry={retry}>
      {children}
    </AreaGate>
  );
}

const screen = (path: string, area: AppArea, element: ReactNode): RouteObject => ({
  path,
  element: <Gate area={area}>{element}</Gate>,
});

/** The update prompt is passed in so tests can build the routes without a service worker. */
export function buildRoutes(updatePrompt: ReactNode = null): RouteObject[] {
  return [
    {
      element: <Shell updatePrompt={updatePrompt} />,
      children: [
        // The root sends everyone to the start of their area.
        { index: true, element: <Gate /> },
        screen('welcome', 'auth', <WelcomePage />),
        screen('sign-up', 'auth', <SignUpPage />),
        screen('sign-in', 'auth', <SignInPage />),
        screen('verify-email', 'verifyEmail', <VerifyEmailPage />),
        screen('choose-role', 'chooseRole', <ChooseRolePage />),
        {
          // Signed-in screens share the header and navigation.
          element: (
            <Gate area="app">
              <AppLayout />
            </Gate>
          ),
          children: [
            { path: 'home', element: <HomePage /> },
            { path: 'onboarding/talent/:step?', element: <TalentOnboardingPage /> },
            { path: 'onboarding/agent', element: <AgentOnboardingPage /> },
            { path: 'portfolio', element: <PortfolioPage /> },
            { path: 'talents/:handle', element: <TalentProfilePage /> },
          ],
        },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}
