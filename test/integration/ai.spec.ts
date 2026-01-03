import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AIModule } from '../../src/ai/ai.module';
import { AIService } from '../../src/ai/ai.service';
import { MockAIProvider } from '../../src/ai/providers/mock-ai.provider';
import { OpenAIProvider } from '../../src/ai/providers/openai.provider';
import {
  SessionMessageDto,
  MessageRole,
} from '../../src/session/dto/session-message.dto';

describe('AI Module Integration', () => {
  let module: TestingModule;
  let aiService: AIService;
  let mockProvider: MockAIProvider;
  let openaiProvider: OpenAIProvider;

  const createMessage = (
    role: MessageRole,
    content: string,
  ): SessionMessageDto => ({
    role,
    content,
    timestamp: Date.now(),
  });

  describe('with default configuration (mock provider)', () => {
    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                AI_PROVIDER: 'mock',
              }),
            ],
          }),
          AIModule,
        ],
      }).compile();

      aiService = module.get<AIService>(AIService);
      mockProvider = module.get<MockAIProvider>(MockAIProvider);
      openaiProvider = module.get<OpenAIProvider>(OpenAIProvider);

      aiService.onModuleInit();
    });

    afterEach(async () => {
      await module.close();
    });

    it('should create AIService', () => {
      expect(aiService).toBeDefined();
    });

    it('should create MockAIProvider', () => {
      expect(mockProvider).toBeDefined();
      expect(mockProvider.name).toBe('mock');
      expect(mockProvider.isAvailable).toBe(true);
    });

    it('should create OpenAIProvider', () => {
      expect(openaiProvider).toBeDefined();
      expect(openaiProvider.name).toBe('openai');
      expect(openaiProvider.isAvailable).toBe(false);
    });

    it('should use mock provider as current provider', () => {
      expect(aiService.currentProvider).toBe('mock');
    });

    it('should not be using fallback when mock is configured', () => {
      expect(aiService.isUsingFallback).toBe(false);
    });

    it('should list only mock as available provider', () => {
      const available = aiService.getAvailableProviders();
      expect(available).toContain('mock');
      expect(available).not.toContain('openai');
    });

    it('should generate completion using mock provider', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
      ];

      const result = await aiService.generateCompletion(messages);

      expect(result.content).toBeDefined();
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.finishReason).toBe('stop');
    });

    it('should generate streaming response', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hi'),
      ];

      const chunks: { content: string; done: boolean }[] = [];
      for await (const chunk of aiService.generateStream(messages)) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[chunks.length - 1].done).toBe(true);
    });
  });

  describe('with OpenAI configured but unavailable', () => {
    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                AI_PROVIDER: 'openai',
                // No API key provided
              }),
            ],
          }),
          AIModule,
        ],
      }).compile();

      aiService = module.get<AIService>(AIService);
      aiService.onModuleInit();
    });

    afterEach(async () => {
      await module.close();
    });

    it('should fall back to mock provider', () => {
      expect(aiService.currentProvider).toBe('mock');
    });

    it('should indicate using fallback', () => {
      expect(aiService.isUsingFallback).toBe(true);
    });

    it('should still generate completions via mock', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
      ];

      const result = await aiService.generateCompletion(messages);

      expect(result.content).toBeDefined();
    });
  });

  describe('provider switching', () => {
    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                AI_PROVIDER: 'mock',
              }),
            ],
          }),
          AIModule,
        ],
      }).compile();

      aiService = module.get<AIService>(AIService);
      aiService.onModuleInit();
    });

    afterEach(async () => {
      await module.close();
    });

    it('should not switch to unavailable OpenAI provider', () => {
      const result = aiService.switchProvider('openai');

      expect(result).toBe(false);
      expect(aiService.currentProvider).toBe('mock');
    });

    it('should switch back to mock provider', () => {
      const result = aiService.switchProvider('mock');

      expect(result).toBe(true);
      expect(aiService.currentProvider).toBe('mock');
    });
  });

  describe('MockAIProvider responses', () => {
    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                AI_PROVIDER: 'mock',
                AI_MOCK_RESPONSE_DELAY_MS: 0, // Fast tests
              }),
            ],
          }),
          AIModule,
        ],
      }).compile();

      aiService = module.get<AIService>(AIService);
      aiService.onModuleInit();
    });

    afterEach(async () => {
      await module.close();
    });

    it('should provide greeting response', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'hello'),
      ];

      const result = await aiService.generateCompletion(messages);

      expect(result.content.toLowerCase()).toMatch(/hello|hi|hey/);
    });

    it('should provide help response', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'I need help'),
      ];

      const result = await aiService.generateCompletion(messages);

      expect(result.content.toLowerCase()).toContain('help');
    });

    it('should include usage statistics', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'test'),
      ];

      const result = await aiService.generateCompletion(messages);

      expect(result.usage).toBeDefined();
      expect(result.usage?.promptTokens).toBeGreaterThan(0);
      expect(result.usage?.completionTokens).toBeGreaterThan(0);
      expect(result.usage?.totalTokens).toBe(
        (result.usage?.promptTokens ?? 0) +
          (result.usage?.completionTokens ?? 0),
      );
    });
  });

  describe('conversation context', () => {
    beforeEach(async () => {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                AI_PROVIDER: 'mock',
                AI_MOCK_RESPONSE_DELAY_MS: 0,
              }),
            ],
          }),
          AIModule,
        ],
      }).compile();

      aiService = module.get<AIService>(AIService);
      aiService.onModuleInit();
    });

    afterEach(async () => {
      await module.close();
    });

    it('should handle multi-turn conversation', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
        createMessage(MessageRole.ASSISTANT, 'Hi there!'),
        createMessage(MessageRole.USER, 'How are you?'),
      ];

      const result = await aiService.generateCompletion(messages);

      expect(result.content).toBeDefined();
      expect(result.finishReason).toBe('stop');
    });

    it('should handle long conversation history', async () => {
      const messages: SessionMessageDto[] = [];
      for (let i = 0; i < 20; i++) {
        messages.push(createMessage(MessageRole.USER, `Message ${i}`));
        messages.push(createMessage(MessageRole.ASSISTANT, `Response ${i}`));
      }

      const result = await aiService.generateCompletion(messages);

      expect(result.content).toBeDefined();
    });
  });
});
