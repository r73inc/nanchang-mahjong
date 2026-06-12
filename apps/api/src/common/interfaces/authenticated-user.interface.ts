export type UserRole = 'user' | 'admin';

export interface AuthenticatedUser {
  sub: string;
  handle: string;
  role: UserRole;
}
