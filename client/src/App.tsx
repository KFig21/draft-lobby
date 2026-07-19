import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { AuthPage } from './pages/Auth/AuthPage';
import { DraftBoardPage } from './pages/DraftBoard/DraftBoardPage';
import { HomePage } from './pages/Home/HomePage';
import { JoinLobbyPage } from './pages/JoinLobby/JoinLobbyPage';
import { LeagueWizardPage } from './pages/LeagueWizard/LeagueWizardPage';
import { LobbyRoomPage } from './pages/LobbyRoom/LobbyRoomPage';
import { LobbyWizardPage } from './pages/LobbyWizard/LobbyWizardPage';
import { ProfilePage } from './pages/Profile/ProfilePage';
import { ScoringFormatCreatorPage } from './pages/ScoringFormatCreator/ScoringFormatCreatorPage';
import { SettingsPage } from './pages/Settings/SettingsPage';
import { SplashPage } from './pages/Splash/SplashPage';

function Protected({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

/** Splash / auth are for signed-out visitors; send signed-in users home. */
function PublicOnly({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  if (session) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
          <Route
            path="/home"
            element={
              <Protected>
                <HomePage />
              </Protected>
            }
          />
          <Route
            path="/profile"
            element={
              <Protected>
                <ProfilePage />
              </Protected>
            }
          />
          <Route
            path="/settings"
            element={
              <Protected>
                <SettingsPage />
              </Protected>
            }
          />
          <Route
            path="/settings/leagues/new"
            element={
              <Protected>
                <LeagueWizardPage />
              </Protected>
            }
          />
          <Route
            path="/settings/leagues/:id/edit"
            element={
              <Protected>
                <LeagueWizardPage />
              </Protected>
            }
          />
          <Route
            path="/settings/scoring/new"
            element={
              <Protected>
                <ScoringFormatCreatorPage />
              </Protected>
            }
          />
          <Route
            path="/settings/scoring/:id/edit"
            element={
              <Protected>
                <ScoringFormatCreatorPage />
              </Protected>
            }
          />
          <Route
            path="/lobby/new"
            element={
              <Protected>
                <LobbyWizardPage />
              </Protected>
            }
          />
          <Route
            path="/lobby/join"
            element={
              <Protected>
                <JoinLobbyPage />
              </Protected>
            }
          />
          <Route
            path="/lobby/:id"
            element={
              <Protected>
                <LobbyRoomPage />
              </Protected>
            }
          />
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
      </BrowserRouter>
    </AuthProvider>
  );
}
