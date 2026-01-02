import { SessionMessageDto } from '../../session/dto/session-message.dto';

export interface AICompletionOptions {
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface AICompletionResult {
  content: string;
  finishReason: 'stop' | 'length' | 'error';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIStreamChunk {
  content: string;
  done: boolean;
}

export interface AIProvider {
  readonly name: string;
  readonly isAvailable: boolean;

  generateCompletion(
    messages: SessionMessageDto[],
    options?: AICompletionOptions,
  ): Promise<AICompletionResult>;

  generateStream?(
    messages: SessionMessageDto[],
    options?: AICompletionOptions,
  ): AsyncGenerator<AIStreamChunk>;
}

export const AI_PROVIDER = Symbol('AI_PROVIDER');
