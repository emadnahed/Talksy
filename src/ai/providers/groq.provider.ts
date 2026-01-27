import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  AICompletionOptions,
  AICompletionResult,
  AIStreamChunk,
} from '../interfaces/ai-provider.interface';
import { SessionMessageDto } from '../../session/dto/session-message.dto';
import { AI_ERRORS } from '../constants/ai.constants';

/**
 * Groq Provider - Free & Fast AI
 *
 * Free tier: 30 requests/minute
 * Models: llama-3.1-70b-versatile, mixtral-8x7b-32768, llama-3.1-8b-instant
 *
 * Get API key: https://console.groq.com/keys
 */
@Injectable()
export class GroqProvider implements AIProvider {
  readonly name = 'groq';
  private readonly logger = new Logger(GroqProvider.name);
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly baseUrl = 'https://api.groq.com/openai/v1';

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GROQ_API_KEY');
    this.model =
      this.configService.get<string>('GROQ_MODEL') || 'llama-3.1-8b-instant';
    const maxTokensValue = this.configService.get<string | number>('GROQ_MAX_TOKENS');
    this.maxTokens = maxTokensValue ? parseInt(String(maxTokensValue), 10) : 1000;
    const tempValue = this.configService.get<string | number>('GROQ_TEMPERATURE');
    this.temperature = tempValue ? parseFloat(String(tempValue)) : 0.7;

    if (this.apiKey) {
      this.logger.log(`Groq provider initialized with model: ${this.model}`);
    } else {
      this.logger.warn(
        'Groq API key not configured. Get one free at https://console.groq.com/keys',
      );
    }
  }

  get isAvailable(): boolean {
    return !!this.apiKey;
  }

  async generateCompletion(
    messages: SessionMessageDto[],
    options?: AICompletionOptions,
  ): Promise<AICompletionResult> {
    if (!this.isAvailable) {
      throw new Error(
        `${AI_ERRORS.PROVIDER_NOT_AVAILABLE}: Groq API key not configured`,
      );
    }

    this.logger.debug(
      `Generating Groq completion for ${messages.length} messages`,
    );

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map((m) => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
          })),
          max_tokens: Math.floor(options?.maxTokens ?? this.maxTokens),
          temperature: options?.temperature ?? this.temperature,
          stream: false,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Groq API error: ${response.status} - ${error}`);
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();

      return {
        content: data.choices[0]?.message?.content || '',
        finishReason:
          (data.choices[0]?.finish_reason as 'stop' | 'length') || 'stop',
        usage: {
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
          totalTokens: data.usage?.total_tokens ?? 0,
        },
      };
    } catch (error) {
      this.logger.error('Groq completion failed', error);
      throw error;
    }
  }

  async *generateStream(
    messages: SessionMessageDto[],
    options?: AICompletionOptions,
  ): AsyncGenerator<AIStreamChunk> {
    if (!this.isAvailable) {
      throw new Error(
        `${AI_ERRORS.PROVIDER_NOT_AVAILABLE}: Groq API key not configured`,
      );
    }

    this.logger.debug(`Generating Groq stream for ${messages.length} messages`);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map((m) => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
          })),
          max_tokens: Math.floor(options?.maxTokens ?? this.maxTokens),
          temperature: options?.temperature ?? this.temperature,
          stream: true,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Groq API error: ${response.status} - ${error}`);
        throw new Error(`Groq API error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          yield { content: '', done: true };
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const content = json.choices?.[0]?.delta?.content || '';
              const finishReason = json.choices?.[0]?.finish_reason;

              if (content) {
                yield { content, done: false };
              }

              if (finishReason === 'stop') {
                yield { content: '', done: true };
                return;
              }
            } catch {
              // Skip malformed JSON
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Groq stream failed', error);
      throw error;
    }
  }
}
