import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ToolRegistryService } from './services/tool-registry.service';
import { ToolExecutorService } from './services/tool-executor.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [ToolRegistryService, ToolExecutorService],
  exports: [ToolRegistryService, ToolExecutorService],
})
export class ToolsModule {}
