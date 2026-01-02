import { Module } from '@nestjs/common';
import { AssistantGateway } from './assistant.gateway';
import { SessionModule } from '../session/session.module';

@Module({
  imports: [SessionModule],
  providers: [AssistantGateway],
  exports: [AssistantGateway],
})
export class GatewayModule {}
