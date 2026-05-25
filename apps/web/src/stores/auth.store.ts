import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { decodeJwtPayload } from '../lib/decode-jwt';

export type UserRole = 'user' | 'admin';

export interface AuthUser {
  sub: string;
  email: string;
  handle: string;
  displayName: string;
  role: UserRole;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;

  /** Called after a successful sign-in or sign-up. Parses user from the JWT. */
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void;

  /** Replace only the access token (e.g. after a token refresh). */
  setAccessToken: (accessToken: string) => void;

  /** Wipe all auth state (sign-out, token expiry). */
  clearAuth: () => void;
}

function parseUser(accessToken: string): AuthUser | null {
  try {
    const payload = decodeJwtPayload(accessToken) as {
      sub?: string;
      email?: string;
      handle?: string;
      displayName?: string;
      role?: UserRole;
    };
    if (!payload.sub || !payload.email) return null;
    return {
      sub: payload.sub,
      email: payload.email,
      handle: payload.handle ?? '',
      displayName: payload.displayName ?? payload.email,
      role: payload.role ?? 'user',
    };
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,

      setTokens: ({ accessToken, refreshToken }) =>
        set({
          accessToken,
          refreshToken,
          user: parseUser(accessToken),
        }),

      setAccessToken: (accessToken) =>
        set((s) => ({
          accessToken,
          user: parseUser(accessToken) ?? s.user,
        })),

      clearAuth: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: 'nanchang-auth',
      // Only persist tokens; user is re-derived from the access token on load.
      partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken }),
    },
  ),
);
