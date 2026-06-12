import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController, UserAvatarController } from './users.controller';

@Module({
  controllers: [UsersController, UserAvatarController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
