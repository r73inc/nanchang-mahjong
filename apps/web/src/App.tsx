import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthPage } from './pages/auth/auth-page';
import { ForgotPasswordPage } from './pages/auth/forgot-password-page';
import { ConfirmResetPage } from './pages/auth/confirm-reset-page';
import { HomeStubPage } from './pages/home/home-stub-page';
import { ChangePasswordPage } from './pages/settings/change-password-page';
import { DeleteAccountPage } from './pages/settings/delete-account-page';
import { AdminPage } from './pages/admin/admin-page';
import { ProfilePage } from './pages/profile/profile-page';
import { FriendsPage } from './pages/friends/friends-page';
import { CustomizeStubPage } from './pages/customize/customize-stub-page';
import { LobbyPage } from './pages/lobby/lobby-page';
import { RoomPage } from './pages/room/room-page';
import { GamePage } from './pages/game/game-page';
import { HistoryPage } from './pages/history/history-page';
import { ReplayPage } from './pages/replay/replay-page';
import { ProtectedRoute } from './components/layout/protected-route';
import { AdminRoute } from './components/layout/admin-route';

/**
 * Route tree for the app.
 *
 * BrowserRouter and global providers (QueryClientProvider, I18nProvider)
 * live in main.tsx so this component is testable with MemoryRouter.
 */
export default function App() {
  return (
    <Routes>
      {/* Root: redirect to /home; ProtectedRoute will send unauthenticated users to /auth */}
      <Route path="/" element={<Navigate to="/home" replace />} />

      {/* Public routes */}
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/confirm-reset" element={<ConfirmResetPage />} />

      {/* Protected routes — unauthenticated users are redirected to /auth */}
      <Route element={<ProtectedRoute />}>
        <Route path="/home" element={<HomeStubPage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/room/:code" element={<RoomPage />} />
        <Route path="/game/:id" element={<GamePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/replay/:id" element={<ReplayPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/customize" element={<CustomizeStubPage />} />
        <Route path="/settings/change-password" element={<ChangePasswordPage />} />
        <Route path="/settings/delete-account" element={<DeleteAccountPage />} />
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
