import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { InvitesModule } from '../invites/invites.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    InvitesModule,
    UsersModule,
    AuthModule, // provides CognitoService
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
