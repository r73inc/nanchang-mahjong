import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { RoomsService } from './rooms.service';
import { RoomsGateway } from './rooms.gateway';
import { RoomsController } from './rooms.controller';

@Module({
  imports: [
    DatabaseModule,
    // AuthModule provides JwtGuard + JwtStrategy (used for REST endpoint auth)
    AuthModule,
  ],
  providers: [RoomsService, RoomsGateway],
  controllers: [RoomsController],
  exports: [RoomsService, RoomsGateway],
})
export class RoomsModule {}
