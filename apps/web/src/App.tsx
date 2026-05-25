import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthPage } from './pages/auth/auth-page';
import { ForgotPasswordPage } from './pages/auth/forgot-password-page';
import { ConfirmResetPage } from './pages/auth/confirm-reset-page';
import { HomeStubPage } from './pages/home/home-stub-page';
import { ChangePasswordPage } from './pages/settings/change-password-page';
import { DeleteAccountPage } from './pages/settings/delete-account-page';
import { ProtectedRoute } from './components/layout/protected-route';

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
        <Route path="/settings/change-password" element={<ChangePasswordPage />} />
        <Route path="/settings/delete-account" element={<DeleteAccountPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
