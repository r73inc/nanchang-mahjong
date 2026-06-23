import { IsIn, IsBoolean } from 'class-validator';
import type { UserPermission } from '../../common/interfaces/authenticated-user.interface';

export class SetPermissionDto {
  @IsIn(['devTestRoom'])
  permission!: UserPermission;

  @IsBoolean()
  grant!: boolean;
}
