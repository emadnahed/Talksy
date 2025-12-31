import { Module } from '@nestjs/common';
import { AssistantGateway } from './assistant.gateway';

@Module({
  providers: [AssistantGateway],
  exports: [AssistantGateway],
})
export class GatewayModule {}
