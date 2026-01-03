import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  AICompletionOptions,
  AICompletionResult,
  AIStreamChunk,
} from '../interfaces/ai-provider.interface';
import { SessionMessageDto } from '../../session/dto/session-message.dto';
import { AI_DEFAULTS } from '../constants/ai.constants';

@Injectable()
export class MockAIProvider implements AIProvider {
  readonly name = 'mock';
  readonly isAvailable = true;

  private readonly logger = new Logger(MockAIProvider.name);
  private readonly responseDelayMs: number;

  constructor(private readonly configService: ConfigService) {
    this.responseDelayMs =
      this.configService.get<number>('AI_MOCK_RESPONSE_DELAY_MS') ??
      AI_DEFAULTS.MOCK_RESPONSE_DELAY_MS;
  }

  async generateCompletion(
    messages: SessionMessageDto[],
    _options?: AICompletionOptions,
  ): Promise<AICompletionResult> {
    this.logger.debug(
      `Generating mock completion for ${messages.length} messages`,
    );

    // Simulate API delay
    await this.delay(this.responseDelayMs);

    const lastUserMessage = this.getLastUserMessage(messages);
    const response = this.generateMockResponse(lastUserMessage, messages);

    const promptTokens = this.estimateTokens(messages);
    const completionTokens = this.estimateTokens([
      { role: 'assistant', content: response } as SessionMessageDto,
    ]);

    return {
      content: response,
      finishReason: 'stop',
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
    };
  }

  async *generateStream(
    messages: SessionMessageDto[],
    _options?: AICompletionOptions,
  ): AsyncGenerator<AIStreamChunk> {
    const lastUserMessage = this.getLastUserMessage(messages);
    const fullResponse = this.generateMockResponse(lastUserMessage, messages);

    // Simulate streaming by yielding words one at a time
    const words = fullResponse.split(' ');

    for (let i = 0; i < words.length; i++) {
      await this.delay(50); // Simulate typing delay
      const content = i === 0 ? words[i] : ' ' + words[i];
      yield {
        content,
        done: false,
      };
    }

    yield {
      content: '',
      done: true,
    };
  }

  private getLastUserMessage(messages: SessionMessageDto[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        return messages[i].content;
      }
    }
    return '';
  }

  private generateMockResponse(
    userMessage: string,
    conversationHistory: SessionMessageDto[],
  ): string {
    const lowerMessage = userMessage.toLowerCase();

    // Greeting responses
    if (
      this.matchesPattern(lowerMessage, ['hello', 'hi', 'hey', 'greetings'])
    ) {
      return this.randomChoice([
        "Hello! I'm Talksy, your AI assistant. How can I help you today?",
        'Hi there! Great to meet you. What would you like to discuss?',
        "Hey! I'm here to help. What's on your mind?",
      ]);
    }

    // How are you
    if (this.matchesPattern(lowerMessage, ['how are you', "how's it going"])) {
      return this.randomChoice([
        "I'm doing great, thanks for asking! I'm ready to assist you with anything you need.",
        "I'm functioning perfectly! How can I help you today?",
        'All systems are running smoothly! What can I do for you?',
      ]);
    }

    // Help requests
    if (this.matchesPattern(lowerMessage, ['help', 'assist', 'support'])) {
      return "I'm here to help! You can ask me questions, have a conversation, or request assistance with various topics. What would you like to know?";
    }

    // Questions about capabilities
    if (
      this.matchesPattern(lowerMessage, [
        'what can you do',
        'capabilities',
        'features',
      ])
    ) {
      return "I'm a conversational AI assistant. I can help you with answering questions, having discussions, providing information, and much more. This is currently a demo mode - when upgraded to a premium provider, I'll have even more capabilities!";
    }

    // Thank you
    if (this.matchesPattern(lowerMessage, ['thank', 'thanks', 'appreciate'])) {
      return this.randomChoice([
        "You're welcome! Is there anything else I can help you with?",
        'Happy to help! Let me know if you need anything else.',
        'My pleasure! Feel free to ask if you have more questions.',
      ]);
    }

    // Goodbye
    if (this.matchesPattern(lowerMessage, ['bye', 'goodbye', 'see you'])) {
      return this.randomChoice([
        'Goodbye! It was nice chatting with you. Come back anytime!',
        'Take care! Feel free to return whenever you need assistance.',
        'See you later! Have a great day!',
      ]);
    }

    // Questions (starts with question words)
    if (
      this.matchesPattern(lowerMessage, [
        'what',
        'why',
        'how',
        'when',
        'where',
        'who',
        'which',
        'can you',
        'could you',
        'would you',
      ])
    ) {
      return this.generateQuestionResponse(userMessage, conversationHistory);
    }

    // Default contextual response
    return this.generateContextualResponse(userMessage, conversationHistory);
  }

  private generateQuestionResponse(
    question: string,
    _history: SessionMessageDto[],
  ): string {
    const responses = [
      `That's an interesting question about "${this.extractTopic(question)}". In demo mode, I provide placeholder responses. When connected to a premium AI provider like OpenAI, I'll be able to give you detailed, accurate answers.`,
      `Great question! While I'm running in demo mode, I can acknowledge your query about "${this.extractTopic(question)}". A premium AI integration would provide comprehensive answers.`,
      `I understand you're asking about "${this.extractTopic(question)}". This demo mode has limited capabilities, but with a premium AI provider, I could provide in-depth responses.`,
    ];

    return this.randomChoice(responses);
  }

  private generateContextualResponse(
    message: string,
    history: SessionMessageDto[],
  ): string {
    const messageCount = history.filter((m) => m.role === 'user').length;

    if (messageCount > 5) {
      return `I appreciate our ongoing conversation! You mentioned "${this.extractTopic(message)}". While in demo mode, my responses are limited. Consider upgrading to a premium AI provider for more intelligent conversations.`;
    }

    return `I received your message about "${this.extractTopic(message)}". I'm currently running in demo mode with preset responses. For more intelligent and contextual replies, the system can be configured to use OpenAI or other premium AI providers.`;
  }

  private extractTopic(message: string): string {
    // Extract first few meaningful words as topic
    const words = message
      .replace(/[?!.,]/g, '')
      .split(' ')
      .filter((w) => w.length > 2)
      .slice(0, 4);
    return words.join(' ') || 'your message';
  }

  private matchesPattern(text: string, patterns: string[]): boolean {
    return patterns.some(
      (pattern) => text.includes(pattern) || text.startsWith(pattern),
    );
  }

  private randomChoice<T>(options: T[]): T {
    return options[Math.floor(Math.random() * options.length)];
  }

  private estimateTokens(messages: SessionMessageDto[]): number {
    // Rough estimation: ~4 characters per token
    const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
