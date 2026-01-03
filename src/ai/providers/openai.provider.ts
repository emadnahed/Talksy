import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  AICompletionOptions,
  AICompletionResult,
  AIStreamChunk,
} from '../interfaces/ai-provider.interface';
import { SessionMessageDto } from '../../session/dto/session-message.dto';
import { AI_DEFAULTS, AI_ERRORS } from '../constants/ai.constants';

/**
 * OpenAI Provider - Premium AI Integration
 *
 * This provider integrates with OpenAI's API for high-quality AI responses.
 * To enable, set AI_PROVIDER=openai and provide OPENAI_API_KEY in environment.
 *
 * Prerequisites:
 * 1. Install OpenAI SDK: npm install openai
 * 2. Set OPENAI_API_KEY environment variable
 * 3. Set AI_PROVIDER=openai in environment
 */
@Injectable()
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY');
    this.model =
      this.configService.get<string>('OPENAI_MODEL') ??
      AI_DEFAULTS.OPENAI_MODEL;
    this.maxTokens =
      this.configService.get<number>('OPENAI_MAX_TOKENS') ??
      AI_DEFAULTS.MAX_TOKENS;
    this.temperature =
      this.configService.get<number>('OPENAI_TEMPERATURE') ??
      AI_DEFAULTS.TEMPERATURE;

    if (!this.apiKey) {
      this.logger.warn(
        'OpenAI API key not configured. Provider will be unavailable.',
      );
    }
  }

  get isAvailable(): boolean {
    return !!this.apiKey;
  }

  async generateCompletion(
    messages: SessionMessageDto[],
    _options?: AICompletionOptions,
  ): Promise<AICompletionResult> {
    if (!this.isAvailable) {
      throw new Error(
        `${AI_ERRORS.PROVIDER_NOT_AVAILABLE}: OpenAI API key not configured`,
      );
    }

    this.logger.debug(
      `Generating OpenAI completion for ${messages.length} messages`,
    );

    try {
      // TODO: Implement actual OpenAI API call when SDK is installed
      // Example implementation:
      //
      // const openai = new OpenAI({ apiKey: this.apiKey });
      // const response = await openai.chat.completions.create({
      //   model: this.model,
      //   messages: messages.map(m => ({
      //     role: m.role as 'user' | 'assistant' | 'system',
      //     content: m.content,
      //   })),
      //   max_tokens: options?.maxTokens ?? this.maxTokens,
      //   temperature: options?.temperature ?? this.temperature,
      // });
      //
      // return {
      //   content: response.choices[0].message.content || '',
      //   finishReason: response.choices[0].finish_reason as 'stop' | 'length',
      //   usage: {
      //     promptTokens: response.usage?.prompt_tokens ?? 0,
      //     completionTokens: response.usage?.completion_tokens ?? 0,
      //     totalTokens: response.usage?.total_tokens ?? 0,
      //   },
      // };

      // Placeholder until OpenAI SDK is installed
      throw new Error('OpenAI SDK not installed. Run: npm install openai');
    } catch (error) {
      this.logger.error('OpenAI completion failed', error);
      throw error;
    }
  }

  async *generateStream(
    messages: SessionMessageDto[],
    _options?: AICompletionOptions,
  ): AsyncGenerator<AIStreamChunk> {
    if (!this.isAvailable) {
      throw new Error(
        `${AI_ERRORS.PROVIDER_NOT_AVAILABLE}: OpenAI API key not configured`,
      );
    }

    this.logger.debug(
      `Generating OpenAI stream for ${messages.length} messages`,
    );

    try {
      // TODO: Implement actual OpenAI streaming when SDK is installed
      // Example implementation:
      //
      // const openai = new OpenAI({ apiKey: this.apiKey });
      // const stream = await openai.chat.completions.create({
      //   model: this.model,
      //   messages: messages.map(m => ({
      //     role: m.role as 'user' | 'assistant' | 'system',
      //     content: m.content,
      //   })),
      //   max_tokens: options?.maxTokens ?? this.maxTokens,
      //   temperature: options?.temperature ?? this.temperature,
      //   stream: true,
      // });
      //
      // for await (const chunk of stream) {
      //   const content = chunk.choices[0]?.delta?.content || '';
      //   const done = chunk.choices[0]?.finish_reason === 'stop';
      //   yield { content, done };
      // }

      // Placeholder until OpenAI SDK is installed
      throw new Error('OpenAI SDK not installed. Run: npm install openai');
    } catch (error) {
      this.logger.error('OpenAI stream failed', error);
      throw error;
    }
  }
}
