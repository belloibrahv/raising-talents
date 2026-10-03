import { lazy, Suspense, type ReactNode } from 'react';
import { Outlet, useOutletContext, type RouteObject } from 'react-router';
import { useRestoreSession } from '../features/auth/use-auth';
import { WelcomePage } from '../features/auth/WelcomePage';
import { FullScreenStatus } from '../shared/ui/FullScreenStatus';
import { t } from '../i18n';
import { NetworkBanner } from '../shared/pwa/NetworkBanner';
import type { AppArea } from '../shared/session/area';
import { AppLayout } from './AppLayout';
import { AuthFrame } from './AuthFrame';
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
const SearchPage = lazy(() =>
  import('../features/search/SearchPage').then((m) => ({ default: m.SearchPage })),
);
const ForgotPasswordPage = lazy(() =>
  import('../features/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
);
const ResetPasswordPage = lazy(() =>
  import('../features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const ModerationPage = lazy(() =>
  import('../features/moderation/ModerationPage').then((m) => ({ default: m.ModerationPage })),
);
const VerificationPage = lazy(() =>
  import('../features/profile/VerificationPage').then((m) => ({ default: m.VerificationPage })),
);
const AgentQueuePage = lazy(() =>
  import('../features/moderation/AgentQueuePage').then((m) => ({ default: m.AgentQueuePage })),
);
const ReportQueuePage = lazy(() =>
  import('../features/moderation/ReportQueuePage').then((m) => ({ default: m.ReportQueuePage })),
);
const ShortlistPage = lazy(() =>
  import('../features/shortlist/ShortlistPage').then((m) => ({ default: m.ShortlistPage })),
);
const NotificationsPage = lazy(() =>
  import('../features/notifications/NotificationsPage').then((m) => ({
    default: m.NotificationsPage,
  })),
);
const AccountPage = lazy(() =>
  import('../features/account/AccountPage').then((m) => ({ default: m.AccountPage })),
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
        screen(
          'sign-up',
          'auth',
          <AuthFrame>
            <SignUpPage />
          </AuthFrame>,
        ),
        screen(
          'sign-in',
          'auth',
          <AuthFrame>
            <SignInPage />
          </AuthFrame>,
        ),
        screen(
          'forgot-password',
          'auth',
          <AuthFrame>
            <ForgotPasswordPage />
          </AuthFrame>,
        ),
        screen(
          'reset-password',
          'auth',
          <AuthFrame>
            <ResetPasswordPage />
          </AuthFrame>,
        ),
        screen(
          'verify-email',
          'verifyEmail',
          <AuthFrame>
            <VerifyEmailPage />
          </AuthFrame>,
        ),
        screen(
          'choose-role',
          'chooseRole',
          <AuthFrame>
            <ChooseRolePage />
          </AuthFrame>,
        ),
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
            { path: 'search', element: <SearchPage /> },
            { path: 'shortlist', element: <ShortlistPage /> },
            { path: 'moderation', element: <ModerationPage /> },
            { path: 'moderation/agents', element: <AgentQueuePage /> },
            { path: 'moderation/reports', element: <ReportQueuePage /> },
            { path: 'verification', element: <VerificationPage /> },
            { path: 'account', element: <AccountPage /> },
            { path: 'notifications', element: <NotificationsPage /> },
          ],
        },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ];
}
