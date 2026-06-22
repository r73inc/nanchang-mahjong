import { SetMetadata } from '@nestjs/common';
import type { UserPermission } from '../interfaces/authenticated-user.interface';

export const PERMISSIONS_KEY = 'permissions';
export const Permissions = (...perms: UserPermission[]) => SetMetadata(PERMISSIONS_KEY, perms);
