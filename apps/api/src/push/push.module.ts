import { Global, Module } from '@nestjs/common';
import { PushService } from './push.service';
import { PushController } from './push.controller';

/**
 * @Global so PushService can be injected into GameService
 * without re-importing PushModule in GameModule.
 */
@Global()
@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
