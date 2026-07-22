import { lazy, Suspense, useEffect } from 'react';
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
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
const NotificationsPage = lazy(() =>
  import('./pages/Notifications/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
);
const ProfilePage = lazy(() => import('./pages/Profile/ProfilePage').then((m) => ({ default: m.ProfilePage })));
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
 * new page; only a hard refresh clears it. Keying on `location.key` (unique
 * per navigation, even to the same path) forces a fresh ErrorBoundary
 * instance on every navigation, discarding the caught error along with it.
 */
function RoutedErrorBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return <ErrorBoundary key={location.key}>{children}</ErrorBoundary>;
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
          {/* Main signed-in pages share the navbar shell. */}
          <Route
            element={
              <Protected>
                <MainLayout />
              </Protected>
            }
          >
            <Route path="/home" element={<HomePage />} />
            <Route path="/profile" element={<ProfilePage />} />
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
                <DraftBoardPage />
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
