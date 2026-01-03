import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  AICompletionOptions,
  AICompletionResult,
  AIStreamChunk,
} from './interfaces/ai-provider.interface';
import { AIProviderType } from './interfaces/ai-config.interface';
import { SessionMessageDto } from '../session/dto/session-message.dto';
import { MockAIProvider } from './providers/mock-ai.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { AI_DEFAULTS, AI_ERRORS } from './constants/ai.constants';

@Injectable()
export class AIService implements OnModuleInit {
  private readonly logger = new Logger(AIService.name);
  private readonly providers: Map<string, AIProvider> = new Map();
  private activeProvider!: AIProvider;
  private readonly configuredProviderType: AIProviderType;

  constructor(
    private readonly configService: ConfigService,
    private readonly mockProvider: MockAIProvider,
    private readonly openaiProvider: OpenAIProvider,
  ) {
    this.configuredProviderType =
      (this.configService.get<string>('AI_PROVIDER') as AIProviderType) ??
      AI_DEFAULTS.PROVIDER;
  }

  onModuleInit(): void {
    this.registerProviders();
    this.selectActiveProvider();
  }

  private registerProviders(): void {
    this.providers.set(this.mockProvider.name, this.mockProvider);
    this.providers.set(this.openaiProvider.name, this.openaiProvider);

    this.logger.log(
      `Registered ${this.providers.size} AI providers: ${Array.from(this.providers.keys()).join(', ')}`,
    );
  }

  private selectActiveProvider(): void {
    const requestedProvider = this.providers.get(this.configuredProviderType);

    if (requestedProvider?.isAvailable) {
      this.activeProvider = requestedProvider;
      this.logger.log(`Using AI provider: ${this.activeProvider.name}`);
      return;
    }

    if (requestedProvider && !requestedProvider.isAvailable) {
      this.logger.warn(
        `Configured provider '${this.configuredProviderType}' is not available. Falling back to mock provider.`,
      );
    } else {
      this.logger.warn(
        `Unknown provider '${this.configuredProviderType}'. Falling back to mock provider.`,
      );
    }

    this.activeProvider = this.mockProvider;
    this.logger.log(`Using fallback AI provider: ${this.activeProvider.name}`);
  }

  get currentProvider(): string {
    return this.activeProvider.name;
  }

  get isUsingFallback(): boolean {
    return (
      this.configuredProviderType !== 'mock' &&
      this.activeProvider.name === 'mock'
    );
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.entries())
      .filter(([, provider]) => provider.isAvailable)
      .map(([name]) => name);
  }

  async generateCompletion(
    messages: SessionMessageDto[],
    options?: AICompletionOptions,
  ): Promise<AICompletionResult> {
    if (!this.activeProvider) {
      throw new Error(AI_ERRORS.PROVIDER_NOT_AVAILABLE);
    }

    this.logger.debug(
      `Generating completion with ${this.activeProvider.name} for ${messages.length} messages`,
    );

    try {
      const result = await this.activeProvider.generateCompletion(
        messages,
        options,
      );
      this.logger.debug(
        `Completion generated: ${result.content.length} chars, ${result.usage?.totalTokens ?? 0} tokens`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Completion failed with ${this.activeProvider.name}`,
        error,
      );
      throw error;
    }
  }

  async *generateStream(
    messages: SessionMessageDto[],
    options?: AICompletionOptions,
  ): AsyncGenerator<AIStreamChunk> {
    if (!this.activeProvider) {
      throw new Error(AI_ERRORS.PROVIDER_NOT_AVAILABLE);
    }

    if (!this.activeProvider.generateStream) {
      this.logger.warn(
        `Provider ${this.activeProvider.name} does not support streaming. Using non-streaming fallback.`,
      );
      const result = await this.activeProvider.generateCompletion(
        messages,
        options,
      );
      yield { content: result.content, done: true };
      return;
    }

    this.logger.debug(
      `Generating stream with ${this.activeProvider.name} for ${messages.length} messages`,
    );

    try {
      yield* this.activeProvider.generateStream(messages, options);
    } catch (error) {
      this.logger.error(
        `Stream failed with ${this.activeProvider.name}`,
        error,
      );
      throw error;
    }
  }

  switchProvider(providerName: AIProviderType): boolean {
    const provider = this.providers.get(providerName);

    if (!provider) {
      this.logger.warn(`Provider '${providerName}' not found`);
      return false;
    }

    if (!provider.isAvailable) {
      this.logger.warn(`Provider '${providerName}' is not available`);
      return false;
    }

    this.activeProvider = provider;
    this.logger.log(`Switched to AI provider: ${providerName}`);
    return true;
  }
}
