import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AIService } from './ai.service';
import { MockAIProvider } from './providers/mock-ai.provider';
import { OpenAIProvider } from './providers/openai.provider';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [MockAIProvider, OpenAIProvider, AIService],
  exports: [AIService],
})
export class AIModule {}
