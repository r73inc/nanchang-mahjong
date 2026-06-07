import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { decodeJwtPayload } from '../lib/decode-jwt';
import { disconnectSocket } from '../lib/socket';

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

// Security note (Phase 1 accepted tradeoff):
// Both tokens are persisted to localStorage, which is readable by any JS on the
// page (XSS risk). For this private family app the attack surface is very low,
// so we accept the tradeoff for development velocity. If threat-modelling demands
// it before Phase 1 ships, the safer option is to have the backend issue
// refreshToken as an HttpOnly cookie (never touches JS). Tracked for Phase 1
// pre-launch review.
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
        // Disconnect the socket so it cannot re-authenticate with the stale token.
        disconnectSocket();
        set({ user: null, accessToken: null, refreshToken: null });
      },
    }),
    {
      name: 'nanchang-auth',
      // Persist tokens AND the parsed user object so that displayName / sub are
      // available immediately on page reload (before any token refresh occurs).
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
      }),
      // After rehydration: if we got an access token but no user (e.g. old
      // localStorage without the user field), re-derive the user from the token.
      onRehydrateStorage: () => (state) => {
        if (state?.accessToken && !state.user) {
          const derived = parseUser(state.accessToken);
          if (derived) state.user = derived;
        }
      },
    },
  ),
);
