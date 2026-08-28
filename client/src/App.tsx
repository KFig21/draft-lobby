import { lazy, Suspense, useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { PendingInviteRedeemer } from './auth/PendingInviteRedeemer';
import { ErrorBoundary } from './components/ErrorBoundary/ErrorBoundary';
import { Loader } from './components/Loader/Loader';
import { MainLayout } from './components/Navbar/MainLayout';
import { NotificationsProvider } from './notifications/NotificationsContext';
import { ThemeProvider } from './theme/ThemeContext';
import { ToastProvider } from './toast/ToastContext';

// Lazy-loaded per route — each page ships as its own chunk, fetched only when
// visited, instead of every page's code (DraftBoardPage especially) landing
// in the single main bundle regardless of which routes a session ever hits.
const AuthPage = lazy(() => import('./pages/Auth/AuthPage').then((m) => ({ default: m.AuthPage })));
const ResetPasswordPage = lazy(() =>
  import('./pages/Auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
);
const OnboardingPage = lazy(() =>
  import('./pages/Onboarding/OnboardingPage').then((m) => ({ default: m.OnboardingPage })),
);
const FriendInvitePage = lazy(() =>
  import('./pages/Invite/FriendInvitePage').then((m) => ({ default: m.FriendInvitePage })),
);
// TEMPORARY: NFL team-chip color tuner — remove with the page + its route.
const TeamColorLab = lazy(() =>
  import('./pages/TeamColorLab/TeamColorLab').then((m) => ({ default: m.TeamColorLab })),
);
const DraftBoardPage = lazy(() =>
  import('./pages/DraftBoard/DraftBoardPage').then((m) => ({ default: m.DraftBoardPage })),
);
const FriendsPage = lazy(() => import('./pages/Friends/FriendsPage').then((m) => ({ default: m.FriendsPage })));
const HomePage = lazy(() => import('./pages/Home/HomePage').then((m) => ({ default: m.HomePage })));
const JoinLobbyPage = lazy(() =>
  import('./pages/JoinLobby/JoinLobbyPage').then((m) => ({ default: m.JoinLobbyPage })),
);
const LeagueWizardPage = lazy(() =>
  import('./pages/LeagueWizard/LeagueWizardPage').then((m) => ({ default: m.LeagueWizardPage })),
);
const LobbyRoomPage = lazy(() =>
  import('./pages/LobbyRoom/LobbyRoomPage').then((m) => ({ default: m.LobbyRoomPage })),
);
const LobbyWizardPage = lazy(() =>
  import('./pages/LobbyWizard/LobbyWizardPage').then((m) => ({ default: m.LobbyWizardPage })),
);
const MyDraftsPage = lazy(() =>
  import('./pages/MyDrafts/MyDraftsPage').then((m) => ({ default: m.MyDraftsPage })),
);
const NotificationsPage = lazy(() =>
  import('./pages/Notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
const ProfilePage = lazy(() => import('./pages/Profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const ImportRulesetPage = lazy(() =>
  import('./pages/ImportRuleset/ImportRulesetPage').then((m) => ({ default: m.ImportRulesetPage })),
);
const RankingsPage = lazy(() =>
  import('./pages/Rankings/RankingsPage').then((m) => ({ default: m.RankingsPage })),
);
const ScoringFormatCreatorPage = lazy(() =>
  import('./pages/ScoringFormatCreator/ScoringFormatCreatorPage').then((m) => ({
    default: m.ScoringFormatCreatorPage,
  })),
);
const SettingsPage = lazy(() => import('./pages/Settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SplashPage = lazy(() => import('./pages/Splash/SplashPage').then((m) => ({ default: m.SplashPage })));

function Protected({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading)
    return (
      <div className="loading">
        <Loader />
      </div>
    );
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

/**
 * Gate for the main app: a verified user who hasn't finished first-run
 * onboarding (profiles.onboarded_at is null) is sent to /welcome. Always sits
 * inside <Protected>, so a session is guaranteed; we only wait on the profile
 * fetch. Never wraps /welcome itself, or it would loop.
 */
function RequireOnboarded({ children }: { children: React.ReactNode }) {
  const { profile, profileLoaded } = useAuth();
  if (!profileLoaded)
    return (
      <div className="loading">
        <Loader />
      </div>
    );
  if (profile && !profile.onboardedAt) return <Navigate to="/welcome" replace />;
  return <>{children}</>;
}

/** Reset scroll to the top whenever the route changes. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

/**
 * ErrorBoundary sits above <Routes> and, once tripped, substitutes
 * ErrorScreen for the entire tree — including Routes itself — so navigating
 * away (e.g. "Back to home") changes the URL but never actually renders the
 * new page; only a hard refresh clears it. Keying on `location.pathname`
 * forces a fresh ErrorBoundary instance whenever the page actually changes,
 * discarding the caught error along with it.
 *
 * Deliberately NOT `location.key` (unique per navigation, even a same-path
 * `replace`): several pages fire a same-pathname `replace` navigation purely
 * to clear consumed router state/query params after a deep link (e.g.
 * DraftBoardPage's notification/pick deep-link effects call `setPickModal`
 * then immediately `navigate(location.pathname, { replace: true, state: null })`
 * in the same tick). `location.key` changes on every navigation regardless of
 * push/replace, so keying on it remounted this entire boundary — wiping the
 * state that was just set — before it ever painted. Keying on pathname only
 * remounts on an actual page change, so same-page cleanup replaces no longer
 * discard in-flight state.
 */
function RoutedErrorBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>;
}

/** Splash / auth are for signed-out visitors; send signed-in users home. */
function PublicOnly({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading)
    return (
      <div className="loading">
        <Loader />
      </div>
    );
  if (session) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationsProvider>
        <ToastProvider>
        <PendingInviteRedeemer />
        <BrowserRouter>
          <ScrollToTop />
          <RoutedErrorBoundary>
          <Suspense
            fallback={
              <div className="loading">
                <Loader />
              </div>
            }
          >
          <Routes>
          <Route
            path="/"
            element={
              <PublicOnly>
                <SplashPage />
              </PublicOnly>
            }
          />
          <Route
            path="/auth"
            element={
              <PublicOnly>
                <AuthPage />
              </PublicOnly>
            }
          />
          {/* Reset-password landing: neither public-only nor protected — the
              recovery link establishes a session, so PublicOnly would bounce
              it to /home before the user could set a new password. */}
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          {/* Friend-invite landing: public so a signed-out (or accountless)
              recipient can see who invited them; it routes them to sign up /
              sign in itself, stashing the token to redeem post-auth. */}
          <Route path="/invite/:token" element={<FriendInvitePage />} />
          {/* TEMPORARY: NFL team-chip color tuner. Remove with the page files. */}
          <Route path="/team-colors" element={<TeamColorLab />} />
          {/* First-run onboarding: session required, but outside the
              onboarding gate (wrapping it would loop). */}
          <Route
            path="/welcome"
            element={
              <Protected>
                <OnboardingPage />
              </Protected>
            }
          />
          {/* Main signed-in pages share the navbar shell. */}
          <Route
            element={
              <Protected>
                <RequireOnboarded>
                  <MainLayout />
                </RequireOnboarded>
              </Protected>
            }
          >
            <Route path="/home" element={<HomePage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/profile/:userId" element={<ProfilePage />} />
            <Route path="/drafts" element={<MyDraftsPage />} />
            <Route path="/rankings" element={<RankingsPage />} />
            <Route path="/import/ruleset/:token" element={<ImportRulesetPage />} />
            <Route path="/friends" element={<FriendsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/leagues/new" element={<LeagueWizardPage />} />
            <Route path="/settings/leagues/:id/edit" element={<LeagueWizardPage />} />
            <Route path="/settings/scoring/new" element={<ScoringFormatCreatorPage />} />
            <Route path="/settings/scoring/:id/edit" element={<ScoringFormatCreatorPage />} />
            <Route path="/lobby/new" element={<LobbyWizardPage />} />
            <Route path="/lobby/join" element={<JoinLobbyPage />} />
            <Route path="/lobby/:id" element={<LobbyRoomPage />} />
          </Route>

          {/* Draft board is full-screen with its own section tabs — no shell. */}
          <Route
            path="/lobby/:id/draft"
            element={
              <Protected>
                <RequireOnboarded>
                  <DraftBoardPage />
                </RequireOnboarded>
              </Protected>
            }
          />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
          </RoutedErrorBoundary>
        </BrowserRouter>
        </ToastProvider>
        </NotificationsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
