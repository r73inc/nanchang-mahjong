export type UserRole = 'user' | 'admin';
export type UserPermission = 'devTestRoom' | 'admin-ai-features';

export interface AuthenticatedUser {
  sub: string;
  handle: string;
  role: UserRole;
  permissions: UserPermission[];
}
