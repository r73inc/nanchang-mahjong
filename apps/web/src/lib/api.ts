/**
 * Axios instance pre-configured for the Nanchang API.
 *
 * - Injects Bearer token on every request.
 * - On 401, attempts a silent token refresh then retries once.
 * - On refresh failure, wipes auth state (triggers redirect via protected route).
 */

import axios, { type InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../stores/auth.store';

// In dev the Vite proxy strips the /api prefix before forwarding to localhost:3001.
// In prod, VITE_API_BASE_URL points at the App Runner endpoint (no /api prefix needed there).
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Request: attach access token ─────────────────────────────────────────────

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response: refresh on 401 ─────────────────────────────────────────────────

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

api.interceptors.response.use(
  (res) => res,
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);

    const config = error.config as RetryConfig | undefined;
    if (error.response?.status !== 401 || !config || config._retry) {
      return Promise.reject(error);
    }

    const refreshToken = useAuthStore.getState().refreshToken;
    if (!refreshToken) {
      useAuthStore.getState().clearAuth();
      return Promise.reject(error);
    }

    config._retry = true;
    try {
      const res = await axios.post<{ accessToken: string }>(`${BASE_URL}/auth/refresh`, {
        refreshToken,
      });
      useAuthStore.getState().setAccessToken(res.data.accessToken);
      config.headers.Authorization = `Bearer ${res.data.accessToken}`;
      return api.request(config);
    } catch {
      useAuthStore.getState().clearAuth();
      return Promise.reject(error);
    }
  },
);

// ── Helper: extract the user-visible error message ───────────────────────────

export function getApiErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string } | undefined;
    if (typeof data?.message === 'string') return data.message;
    if (error.message) return error.message;
  }
  return fallback;
}
