import { IsIn } from 'class-validator';

export class SetRoleDto {
  @IsIn(['user', 'admin'])
  role!: 'user' | 'admin';
}
