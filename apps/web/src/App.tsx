import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useThemeStore } from './stores/theme.store';
import { applyTheme } from './lib/theme.utils';
import { AuthPage } from './pages/auth/auth-page';
import { HomeStubPage } from './pages/home/home-stub-page';
import { ChangePasswordPage } from './pages/settings/change-password-page';
import { DeleteAccountPage } from './pages/settings/delete-account-page';
import { AccountPage } from './pages/account/account-page';
import { AdminPage } from './pages/admin/admin-page';
import { ProfilePage } from './pages/profile/profile-page';
import { FriendsPage } from './pages/friends/friends-page';
import { LobbyPage } from './pages/lobby/lobby-page';
import { RoomPage } from './pages/room/room-page';
import { GamePage } from './pages/game/game-page';
import { HistoryPage } from './pages/history/history-page';
import { ReplayPage } from './pages/replay/replay-page';
import { LearnPage } from './pages/learn/learn-page';
import { CustomizePage } from './pages/customize/customize-page';
import { ChallengeCreatePage } from './pages/challenges/challenge-create-page';
import { ChallengeDetailPage } from './pages/challenges/challenge-detail-page';
import { ProtectedRoute } from './components/layout/protected-route';
import { AdminRoute } from './components/layout/admin-route';
import { AppErrorBoundary } from './components/error-boundary';

// Module-level constant avoids i18next/no-literal-string on the context prop.
const GAME_PAGE_CONTEXT = 'GamePage' as const;

/**
 * Route tree for the app.
 *
 * BrowserRouter and global providers (QueryClientProvider, I18nProvider)
 * live in main.tsx so this component is testable with MemoryRouter.
 */
export default function App() {
  // Sync theme store → CSS custom properties on mount and on any change
  const { felt, tilePalette } = useThemeStore();
  useEffect(() => {
    applyTheme(felt, tilePalette);
  }, [felt, tilePalette]);

  return (
    <Routes>
      {/* Root: redirect to /home; ProtectedRoute will send unauthenticated users to /auth */}
      <Route path="/" element={<Navigate to="/home" replace />} />

      {/* Public routes */}
      <Route path="/auth" element={<AuthPage />} />

      {/* Protected routes — unauthenticated users are redirected to /auth */}
      <Route element={<ProtectedRoute />}>
        <Route path="/home" element={<HomeStubPage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route
          path="/game/:id"
          element={
            <AppErrorBoundary context={GAME_PAGE_CONTEXT}>
              <GamePage />
            </AppErrorBoundary>
          }
        />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/replay/:id" element={<ReplayPage />} />
        <Route path="/learn" element={<LearnPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/customize" element={<CustomizePage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/settings/change-password" element={<ChangePasswordPage />} />
        <Route path="/settings/delete-account" element={<DeleteAccountPage />} />
        <Route path="/challenges/create" element={<ChallengeCreatePage />} />
        <Route path="/challenges/:challengeId" element={<ChallengeDetailPage />} />
      </Route>

      {/* Admin-only routes — non-admins are redirected to /home */}
      <Route element={<AdminRoute />}>
        <Route path="/admin" element={<AdminPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
