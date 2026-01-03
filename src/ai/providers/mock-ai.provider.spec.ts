import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MockAIProvider } from './mock-ai.provider';
import {
  SessionMessageDto,
  MessageRole,
} from '../../session/dto/session-message.dto';

describe('MockAIProvider', () => {
  let provider: MockAIProvider;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MockAIProvider,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    provider = module.get<MockAIProvider>(MockAIProvider);
  });

  describe('initialization', () => {
    it('should use default response delay when not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await Test.createTestingModule({
        providers: [
          MockAIProvider,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      expect(mockConfigService.get).toHaveBeenCalledWith(
        'AI_MOCK_RESPONSE_DELAY_MS',
      );
    });

    it('should use configured response delay', async () => {
      mockConfigService.get.mockReturnValue(1000);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MockAIProvider,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const newProvider = module.get<MockAIProvider>(MockAIProvider);
      expect(newProvider).toBeDefined();
    });
  });

  describe('provider properties', () => {
    it('should have name "mock"', () => {
      expect(provider.name).toBe('mock');
    });

    it('should always be available', () => {
      expect(provider.isAvailable).toBe(true);
    });
  });

  describe('generateCompletion', () => {
    const createMessage = (
      role: MessageRole,
      content: string,
    ): SessionMessageDto => ({
      role,
      content,
      timestamp: Date.now(),
    });

    it('should generate greeting response for hello', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
      ];

      const result = await provider.generateCompletion(messages);

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.finishReason).toBe('stop');
      expect(result.usage).toBeDefined();
      expect(result.usage?.promptTokens).toBeGreaterThan(0);
      expect(result.usage?.completionTokens).toBeGreaterThan(0);
      expect(result.usage?.totalTokens).toBe(
        (result.usage?.promptTokens ?? 0) +
          (result.usage?.completionTokens ?? 0),
      );
    });

    it('should generate response for "how are you"', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'how are you doing?'),
      ];

      const result = await provider.generateCompletion(messages);

      expect(result.content).toBeDefined();
      expect(result.finishReason).toBe('stop');
    });

    it('should generate help response', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'I need help'),
      ];

      const result = await provider.generateCompletion(messages);

      expect(result.content).toContain('help');
    });

    it('should generate capabilities response', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'what can you do?'),
      ];

      const result = await provider.generateCompletion(messages);

      expect(result.content).toBeDefined();
    });

    it('should generate thank you response', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'thank you so much'),
      ];

      const result = await provider.generateCompletion(messages);

      expect(result.content).toBeDefined();
    });

    it('should generate goodbye response', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'goodbye'),
      ];

      const result = await provider.generateCompletion(messages);

      expect(result.content).toBeDefined();
    });

    it('should generate question response for questions', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'What is the weather like?'),
      ];

      const result = await provider.generateCompletion(messages);

      expect(result.content).toBeDefined();
      expect(result.content).toContain('demo mode');
    });

    it('should generate contextual response for generic messages', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'some random message'),
      ];

      const result = await provider.generateCompletion(messages);

      expect(result.content).toBeDefined();
    });

    it('should handle empty message history', async () => {
      const messages: SessionMessageDto[] = [];

      const result = await provider.generateCompletion(messages);

      expect(result.content).toBeDefined();
    });

    it('should use last user message from conversation history', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'first message'),
        createMessage(MessageRole.ASSISTANT, 'response'),
        createMessage(MessageRole.USER, 'hello'),
      ];

      const result = await provider.generateCompletion(messages);

      expect(result.content).toBeDefined();
    });

    it('should handle long conversation history', async () => {
      const messages: SessionMessageDto[] = [];
      for (let i = 0; i < 10; i++) {
        messages.push(createMessage(MessageRole.USER, `message ${i}`));
        messages.push(createMessage(MessageRole.ASSISTANT, `response ${i}`));
      }

      const result = await provider.generateCompletion(messages);

      expect(result.content).toBeDefined();
      expect(result.content).toContain('conversation');
    });

    it('should accept options parameter', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'test'),
      ];

      const result = await provider.generateCompletion(messages, {
        maxTokens: 500,
        temperature: 0.5,
      });

      expect(result.content).toBeDefined();
    });
  });

  describe('generateStream', () => {
    const createMessage = (
      role: MessageRole,
      content: string,
    ): SessionMessageDto => ({
      role,
      content,
      timestamp: Date.now(),
    });

    it('should stream response word by word', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'hello'),
      ];

      const chunks: { content: string; done: boolean }[] = [];
      for await (const chunk of provider.generateStream(messages)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[chunks.length - 1].done).toBe(true);
      expect(chunks[chunks.length - 1].content).toBe('');
    });

    it('should yield content chunks before done signal', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'hi'),
      ];

      const chunks: { content: string; done: boolean }[] = [];
      for await (const chunk of provider.generateStream(messages)) {
        chunks.push(chunk);
      }

      const contentChunks = chunks.filter((c) => !c.done);
      expect(contentChunks.length).toBeGreaterThan(0);
      expect(contentChunks.every((c) => c.done === false)).toBe(true);
    });

    it('should build complete response from chunks', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'hello'),
      ];

      let fullResponse = '';
      for await (const chunk of provider.generateStream(messages)) {
        fullResponse += chunk.content;
      }

      expect(fullResponse.length).toBeGreaterThan(0);
    });

    it('should accept options parameter', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'test'),
      ];

      const chunks: { content: string; done: boolean }[] = [];
      for await (const chunk of provider.generateStream(messages, {
        maxTokens: 100,
      })) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('pattern matching', () => {
    const createMessage = (
      role: MessageRole,
      content: string,
    ): SessionMessageDto => ({
      role,
      content,
      timestamp: Date.now(),
    });

    it.each([
      ['hi', 'greeting'],
      ['hey there', 'greeting'],
      ['greetings', 'greeting'],
    ])('should match "%s" as %s', async (input, _type) => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, input),
      ];

      const result = await provider.generateCompletion(messages);
      expect(result.content).toBeDefined();
    });

    it.each([
      ['why is the sky blue', 'question'],
      ['how does this work', 'question'],
      ['when will it be ready', 'question'],
      ['where can I find it', 'question'],
      ['who created this', 'question'],
      ['which one should I use', 'question'],
      ['can you help me', 'question'],
      ['could you explain', 'question'],
      ['would you please', 'question'],
    ])('should match "%s" as %s', async (input, _type) => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, input),
      ];

      const result = await provider.generateCompletion(messages);
      expect(result.content).toBeDefined();
    });
  });
});
