import { Module } from '@nestjs/common';
import { AssistantGateway } from './assistant.gateway';
import { SessionModule } from '../session/session.module';
import { ToolsModule } from '../tools/tools.module';

@Module({
  imports: [SessionModule, ToolsModule],
  providers: [AssistantGateway],
  exports: [AssistantGateway],
})
export class GatewayModule {}
