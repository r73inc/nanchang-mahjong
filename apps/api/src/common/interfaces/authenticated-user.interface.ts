export type UserRole = 'user' | 'admin';
export type UserPermission = 'devTestRoom';

export interface AuthenticatedUser {
  sub: string;
  handle: string;
  role: UserRole;
  permissions: UserPermission[];
}
