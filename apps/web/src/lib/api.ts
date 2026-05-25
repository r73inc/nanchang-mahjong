/**
 * Axios instance pre-configured for the Nanchang API.
 *
 * - Injects Bearer token on every request.
 * - On 401, attempts a silent token refresh then retries once.
 *   A concurrency lock ensures only one refresh call is in-flight at a time;
 *   subsequent 401s queue their retries and are flushed once the refresh settles.
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

// ── Response: refresh on 401 (with concurrency queue) ────────────────────────
//
// Problem: if multiple requests fire simultaneously while the access token is
// expired, each one gets a 401 and naively each would kick off its own refresh
// call.  Cognito may revoke the refresh token on the second concurrent use,
// locking the user out even though the first refresh succeeded.
//
// Solution: a module-level `isRefreshing` flag + `failedQueue` ensure that
// only one /auth/refresh call is in flight.  Every other 401 that arrives while
// the refresh is pending pushes a resolver into the queue; when the refresh
// settles the queue is flushed with either the new token or the error.

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

interface QueueEntry {
  resolve: (token: string) => void;
  reject: (reason: unknown) => void;
}

let isRefreshing = false;
let failedQueue: QueueEntry[] = [];

function flushQueue(error: unknown, token: string | null) {
  for (const entry of failedQueue) {
    if (error) {
      entry.reject(error);
    } else {
      entry.resolve(token!);
    }
  }
  failedQueue = [];
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

    // If a refresh is already running, queue this request to retry once it resolves.
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((newToken) => {
        config.headers.Authorization = `Bearer ${newToken}`;
        return api.request(config);
      });
    }

    // We're the first — take the lock and kick off the refresh.
    config._retry = true;
    isRefreshing = true;

    try {
      const res = await axios.post<{ accessToken: string }>(`${BASE_URL}/auth/refresh`, {
        refreshToken,
      });
      const newToken = res.data.accessToken;
      useAuthStore.getState().setAccessToken(newToken);
      config.headers.Authorization = `Bearer ${newToken}`;
      flushQueue(null, newToken);
      return api.request(config);
    } catch (refreshError) {
      flushQueue(refreshError, null);
      useAuthStore.getState().clearAuth();
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
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
