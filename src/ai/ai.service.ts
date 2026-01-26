import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
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
import { GroqProvider } from './providers/groq.provider';
import { AI_DEFAULTS, AI_ERRORS } from './constants/ai.constants';
import { LRUCache } from '../cache/lru-cache';

interface AICacheConfig {
  enabled: boolean;
  ttlMs: number;
  maxSize: number;
}

interface CachedAIResponse {
  result: AICompletionResult;
  cachedAt: number;
}

@Injectable()
export class AIService implements OnModuleInit {
  private readonly logger = new Logger(AIService.name);
  private readonly providers: Map<string, AIProvider> = new Map();
  private activeProvider!: AIProvider;
  private readonly configuredProviderType: AIProviderType;
  private readonly cacheConfig: AICacheConfig;
  private responseCache!: LRUCache<CachedAIResponse>;

  // Cache statistics
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly mockProvider: MockAIProvider,
    private readonly openaiProvider: OpenAIProvider,
    private readonly groqProvider: GroqProvider,
  ) {
    this.configuredProviderType =
      (this.configService.get<string>('AI_PROVIDER') as AIProviderType) ??
      AI_DEFAULTS.PROVIDER;

    // Initialize cache configuration
    this.cacheConfig = {
      enabled: this.configService.get<boolean>('AI_CACHE_ENABLED', true),
      ttlMs: this.configService.get<number>('AI_CACHE_TTL_MS', 3600000), // 1 hour
      maxSize: this.configService.get<number>('AI_CACHE_MAX_SIZE', 500),
    };
  }

  onModuleInit(): void {
    this.registerProviders();
    this.selectActiveProvider();
    this.initializeCache();
  }

  private initializeCache(): void {
    if (!this.cacheConfig.enabled) {
      this.logger.log('AI response caching is disabled');
      this.responseCache = new LRUCache<CachedAIResponse>(1, 0);
      return;
    }

    this.responseCache = new LRUCache<CachedAIResponse>(
      this.cacheConfig.maxSize,
      this.cacheConfig.ttlMs,
    );

    this.logger.log(
      `AI response caching enabled - Max size: ${this.cacheConfig.maxSize}, TTL: ${this.cacheConfig.ttlMs}ms`,
    );
  }

  /**
   * Generate a cache key from messages
   * Uses SHA256 hash of normalized message content
   */
  private generateCacheKey(
    messages: SessionMessageDto[],
    options?: AICompletionOptions,
  ): string {
    // Normalize messages to create consistent hash
    const normalizedContent = messages
      .map((m) => `${m.role}:${m.content.trim().toLowerCase()}`)
      .join('|');

    // Include relevant options that affect output
    const optionsStr = options
      ? JSON.stringify({
          maxTokens: options.maxTokens,
          temperature: options.temperature,
        })
      : '';

    const contentToHash = `${this.activeProvider.name}:${normalizedContent}:${optionsStr}`;
    return crypto.createHash('sha256').update(contentToHash).digest('hex');
  }

  private registerProviders(): void {
    this.providers.set(this.mockProvider.name, this.mockProvider);
    this.providers.set(this.openaiProvider.name, this.openaiProvider);
    this.providers.set(this.groqProvider.name, this.groqProvider);

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

    // Check cache first (if enabled)
    if (this.cacheConfig.enabled) {
      const cacheKey = this.generateCacheKey(messages, options);
      const cached = this.responseCache.get(cacheKey);

      if (cached) {
        this.cacheHits++;
        this.logger.debug(
          `AI cache HIT: returning cached response (${cached.result.content.length} chars)`,
        );
        return cached.result;
      }
      this.cacheMisses++;
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

      // Cache the result (if enabled)
      if (this.cacheConfig.enabled) {
        const cacheKey = this.generateCacheKey(messages, options);
        this.responseCache.set(cacheKey, {
          result,
          cachedAt: Date.now(),
        });
        this.logger.debug('AI response cached');
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Completion failed with ${this.activeProvider.name}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Get AI cache statistics
   */
  getCacheStats(): {
    enabled: boolean;
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
    maxSize: number;
  } {
    const total = this.cacheHits + this.cacheMisses;
    return {
      enabled: this.cacheConfig.enabled,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate: total > 0 ? (this.cacheHits / total) * 100 : 0,
      size: this.responseCache.size(),
      maxSize: this.cacheConfig.maxSize,
    };
  }

  /**
   * Clear the AI response cache
   */
  clearCache(): void {
    this.responseCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.logger.log('AI response cache cleared');
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
