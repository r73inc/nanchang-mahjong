import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import type { SignupInput, SigninInput, ChangePasswordInput } from '@nanchang/shared';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ── Sign Up ───────────────────────────────────────────────────────────────────

export function useSignup() {
  const setTokens = useAuthStore((s) => s.setTokens);
  return useMutation({
    mutationFn: (data: SignupInput) =>
      api.post<AuthTokens>('/auth/signup', data).then((r) => r.data),
    onSuccess: (data) => setTokens(data),
  });
}

// ── Sign In ───────────────────────────────────────────────────────────────────

export function useSignin() {
  const setTokens = useAuthStore((s) => s.setTokens);
  return useMutation({
    mutationFn: (data: SigninInput) =>
      api.post<AuthTokens>('/auth/signin', data).then((r) => r.data),
    onSuccess: (data) => setTokens(data),
  });
}

// ── Sign Out ──────────────────────────────────────────────────────────────────

export function useSignout() {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();
  const qc = useQueryClient();
  return () => {
    qc.clear();
    clearAuth();
    navigate('/auth', { replace: true });
  };
}

// ── Change Password ───────────────────────────────────────────────────────────

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: ChangePasswordInput) =>
      api.post('/auth/change-password', data).then(() => undefined),
  });
}

// ── Delete Account ────────────────────────────────────────────────────────────

export function useDeleteAccount() {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => api.delete('/auth/account').then(() => undefined),
    onSuccess: () => {
      clearAuth();
      navigate('/auth', { replace: true });
    },
  });
}

// ── Sync user permissions on mount ────────────────────────────────────────────
//
// Permissions live in the JWT payload. After an admin grants or revokes a
// permission the backend DB is updated immediately, but the stored token is
// stale. Calling /auth/refresh re-reads the DB and returns a new access token
// with current permissions, so any UI gated on user.permissions updates without
// requiring a sign-out/sign-in cycle.

export function useSyncUserOnMount() {
  useEffect(() => {
    const { refreshToken, setAccessToken } = useAuthStore.getState();
    if (!refreshToken) return;
    void api
      .post<{ accessToken: string }>('/auth/refresh', { refreshToken })
      .then(({ data }) => setAccessToken(data.accessToken))
      .catch(() => undefined);
  }, []);
}

// ── Re-export helper ─────────────────────────────────────────────────────────

export { getApiErrorMessage };
