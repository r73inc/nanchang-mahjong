import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { decodeJwtPayload } from '../lib/decode-jwt';
import { disconnectSocket } from '../lib/socket';

export type UserRole = 'user' | 'admin';
export type UserPermission = 'devTestRoom';

export interface AuthUser {
  sub: string;
  handle: string;
  role: UserRole;
  permissions: UserPermission[];
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

export function parseUser(accessToken: string): AuthUser | null {
  try {
    const payload = decodeJwtPayload(accessToken) as {
      sub?: string;
      handle?: string;
      role?: UserRole;
      permissions?: UserPermission[];
    };
    if (!payload.sub || !payload.handle) return null;
    return {
      sub: payload.sub,
      handle: payload.handle,
      role: payload.role ?? 'user',
      permissions: payload.permissions ?? [],
    };
  } catch {
    return null;
  }
}

// Security note (Phase 1 accepted tradeoff):
// Both tokens are persisted to localStorage, which is readable by any JS on the
// page (XSS risk). For this private family app the attack surface is very low,
// so we accept the tradeoff for development velocity.
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

      clearAuth: () => {
        disconnectSocket();
        set({ user: null, accessToken: null, refreshToken: null });
      },
    }),
    {
      name: 'nanchang-auth',
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
      }),
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken && !state.user) {
          const derived = parseUser(state.accessToken);
          if (derived) state.user = derived;
        }
      },
    },
  ),
);
