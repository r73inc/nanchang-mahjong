export type UserRole = 'user' | 'admin';

export interface AuthenticatedUser {
  sub: string; // Cognito User ID
  email: string;
  handle: string;
  displayName: string;
  role: UserRole;
}
