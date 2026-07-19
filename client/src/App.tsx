import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { MainLayout } from './components/Navbar/MainLayout';
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
      </BrowserRouter>
    </AuthProvider>
  );
}
