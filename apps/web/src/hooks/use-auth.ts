import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, getApiErrorMessage } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import type {
  SignupInput,
  SigninInput,
  ForgotPasswordInput,
  ConfirmForgotPasswordInput,
  ChangePasswordInput,
} from '@nanchang/shared';

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
  return () => {
    clearAuth();
    navigate('/auth', { replace: true });
  };
}

// ── Forgot Password ───────────────────────────────────────────────────────────

export function useForgotPassword() {
  return useMutation({
    mutationFn: (data: ForgotPasswordInput) =>
      api.post('/auth/forgot-password', data).then(() => undefined),
  });
}

// ── Confirm Reset Password ────────────────────────────────────────────────────

export function useConfirmReset() {
  return useMutation({
    mutationFn: (data: ConfirmForgotPasswordInput) =>
      api.post('/auth/confirm-forgot-password', data).then(() => undefined),
  });
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

// ── Re-export helper ─────────────────────────────────────────────────────────

export { getApiErrorMessage };
