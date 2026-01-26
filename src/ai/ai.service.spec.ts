import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AIService } from './ai.service';
import { MockAIProvider } from './providers/mock-ai.provider';
import { OpenAIProvider } from './providers/openai.provider';
import { GroqProvider } from './providers/groq.provider';
import {
  SessionMessageDto,
  MessageRole,
} from '../session/dto/session-message.dto';
import {
  AICompletionResult,
  AIStreamChunk,
} from './interfaces/ai-provider.interface';

describe('AIService', () => {
  let service: AIService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockMockProvider = {
    name: 'mock',
    isAvailable: true,
    generateCompletion: jest.fn(),
    generateStream: jest.fn(),
  };

  const mockOpenAIProvider = {
    name: 'openai',
    isAvailable: false,
    generateCompletion: jest.fn(),
    generateStream: jest.fn(),
  };

  const mockGroqProvider = {
    name: 'groq',
    isAvailable: false,
    generateCompletion: jest.fn(),
    generateStream: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigService.get.mockReturnValue('mock');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AIService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: MockAIProvider, useValue: mockMockProvider },
        { provide: OpenAIProvider, useValue: mockOpenAIProvider },
        { provide: GroqProvider, useValue: mockGroqProvider },
      ],
    }).compile();

    service = module.get<AIService>(AIService);
    service.onModuleInit();
  });

  const createMessage = (
    role: MessageRole,
    content: string,
  ): SessionMessageDto => ({
    role,
    content,
    timestamp: Date.now(),
  });

  describe('initialization', () => {
    it('should register all providers on init', () => {
      expect(service.getAvailableProviders()).toContain('mock');
    });

    it('should use mock provider by default', () => {
      expect(service.currentProvider).toBe('mock');
    });

    it('should not be using fallback when mock is configured', () => {
      expect(service.isUsingFallback).toBe(false);
    });
  });

  describe('provider selection', () => {
    it('should fall back to mock when openai is configured but unavailable', async () => {
      mockConfigService.get.mockReturnValue('openai');
      mockOpenAIProvider.isAvailable = false;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AIService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: MockAIProvider, useValue: mockMockProvider },
          { provide: OpenAIProvider, useValue: mockOpenAIProvider },
          { provide: GroqProvider, useValue: mockGroqProvider },
        ],
      }).compile();

      const newService = module.get<AIService>(AIService);
      newService.onModuleInit();

      expect(newService.currentProvider).toBe('mock');
      expect(newService.isUsingFallback).toBe(true);
    });

    it('should use openai when available and configured', async () => {
      mockConfigService.get.mockReturnValue('openai');
      mockOpenAIProvider.isAvailable = true;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AIService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: MockAIProvider, useValue: mockMockProvider },
          { provide: OpenAIProvider, useValue: mockOpenAIProvider },
          { provide: GroqProvider, useValue: mockGroqProvider },
        ],
      }).compile();

      const newService = module.get<AIService>(AIService);
      newService.onModuleInit();

      expect(newService.currentProvider).toBe('openai');
      expect(newService.isUsingFallback).toBe(false);

      // Reset for other tests
      mockOpenAIProvider.isAvailable = false;
    });

    it('should fall back to mock for unknown provider', async () => {
      mockConfigService.get.mockReturnValue('unknown');

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AIService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: MockAIProvider, useValue: mockMockProvider },
          { provide: OpenAIProvider, useValue: mockOpenAIProvider },
          { provide: GroqProvider, useValue: mockGroqProvider },
        ],
      }).compile();

      const newService = module.get<AIService>(AIService);
      newService.onModuleInit();

      expect(newService.currentProvider).toBe('mock');
    });

    it('should use default provider when not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AIService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: MockAIProvider, useValue: mockMockProvider },
          { provide: OpenAIProvider, useValue: mockOpenAIProvider },
          { provide: GroqProvider, useValue: mockGroqProvider },
        ],
      }).compile();

      const newService = module.get<AIService>(AIService);
      newService.onModuleInit();

      expect(newService.currentProvider).toBe('mock');
    });
  });

  describe('getAvailableProviders', () => {
    it('should return only available providers', () => {
      mockOpenAIProvider.isAvailable = false;
      mockMockProvider.isAvailable = true;

      const available = service.getAvailableProviders();

      expect(available).toContain('mock');
      expect(available).not.toContain('openai');
    });

    it('should include openai when available', async () => {
      mockOpenAIProvider.isAvailable = true;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AIService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: MockAIProvider, useValue: mockMockProvider },
          { provide: OpenAIProvider, useValue: mockOpenAIProvider },
          { provide: GroqProvider, useValue: mockGroqProvider },
        ],
      }).compile();

      const newService = module.get<AIService>(AIService);
      newService.onModuleInit();

      const available = newService.getAvailableProviders();

      expect(available).toContain('mock');
      expect(available).toContain('openai');

      // Reset
      mockOpenAIProvider.isAvailable = false;
    });
  });

  describe('switchProvider', () => {
    it('should switch to available provider', async () => {
      mockOpenAIProvider.isAvailable = true;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AIService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: MockAIProvider, useValue: mockMockProvider },
          { provide: OpenAIProvider, useValue: mockOpenAIProvider },
          { provide: GroqProvider, useValue: mockGroqProvider },
        ],
      }).compile();

      const newService = module.get<AIService>(AIService);
      newService.onModuleInit();

      const result = newService.switchProvider('openai');

      expect(result).toBe(true);
      expect(newService.currentProvider).toBe('openai');

      // Reset
      mockOpenAIProvider.isAvailable = false;
    });

    it('should not switch to unavailable provider', () => {
      mockOpenAIProvider.isAvailable = false;

      const result = service.switchProvider('openai');

      expect(result).toBe(false);
      expect(service.currentProvider).toBe('mock');
    });

    it('should not switch to unknown provider', () => {
      const result = service.switchProvider('unknown' as 'mock' | 'openai');

      expect(result).toBe(false);
      expect(service.currentProvider).toBe('mock');
    });
  });

  describe('generateCompletion', () => {
    it('should delegate to active provider', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
      ];

      const expectedResult: AICompletionResult = {
        content: 'Hello there!',
        finishReason: 'stop',
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      };

      mockMockProvider.generateCompletion.mockResolvedValue(expectedResult);

      const result = await service.generateCompletion(messages);

      expect(mockMockProvider.generateCompletion).toHaveBeenCalledWith(
        messages,
        undefined,
      );
      expect(result).toEqual(expectedResult);
    });

    it('should pass options to provider', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
      ];
      const options = { maxTokens: 500, temperature: 0.5 };

      mockMockProvider.generateCompletion.mockResolvedValue({
        content: 'Response',
        finishReason: 'stop',
      });

      await service.generateCompletion(messages, options);

      expect(mockMockProvider.generateCompletion).toHaveBeenCalledWith(
        messages,
        options,
      );
    });

    it('should propagate provider errors', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
      ];

      mockMockProvider.generateCompletion.mockRejectedValue(
        new Error('Provider error'),
      );

      await expect(service.generateCompletion(messages)).rejects.toThrow(
        'Provider error',
      );
    });
  });

  describe('generateStream', () => {
    it('should delegate to active provider stream', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
      ];

      async function* mockGenerator(): AsyncGenerator<AIStreamChunk> {
        yield { content: 'Hello', done: false };
        yield { content: ' there!', done: false };
        yield { content: '', done: true };
      }

      mockMockProvider.generateStream.mockReturnValue(mockGenerator());

      const chunks: AIStreamChunk[] = [];
      for await (const chunk of service.generateStream(messages)) {
        chunks.push(chunk);
      }

      expect(mockMockProvider.generateStream).toHaveBeenCalledWith(
        messages,
        undefined,
      );
      expect(chunks).toHaveLength(3);
      expect(chunks[2].done).toBe(true);
    });

    it('should pass options to provider stream', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
      ];
      const options = { maxTokens: 100 };

      async function* mockGenerator(): AsyncGenerator<AIStreamChunk> {
        yield { content: 'Response', done: true };
      }

      mockMockProvider.generateStream.mockReturnValue(mockGenerator());

      const chunks: AIStreamChunk[] = [];
      for await (const chunk of service.generateStream(messages, options)) {
        chunks.push(chunk);
      }

      expect(mockMockProvider.generateStream).toHaveBeenCalledWith(
        messages,
        options,
      );
    });

    it('should fall back to non-streaming when provider lacks stream support', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
      ];

      const noStreamProvider = {
        name: 'mock',
        isAvailable: true,
        generateCompletion: jest.fn().mockResolvedValue({
          content: 'Full response',
          finishReason: 'stop',
        }),
        generateStream: undefined,
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AIService,
          { provide: ConfigService, useValue: mockConfigService },
          { provide: MockAIProvider, useValue: noStreamProvider },
          { provide: OpenAIProvider, useValue: mockOpenAIProvider },
          { provide: GroqProvider, useValue: mockGroqProvider },
        ],
      }).compile();

      const newService = module.get<AIService>(AIService);
      newService.onModuleInit();

      const chunks: AIStreamChunk[] = [];
      for await (const chunk of newService.generateStream(messages)) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].content).toBe('Full response');
      expect(chunks[0].done).toBe(true);
    });

    it('should propagate stream errors', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
      ];

      async function* errorGenerator(): AsyncGenerator<AIStreamChunk> {
        throw new Error('Stream error');
      }

      mockMockProvider.generateStream.mockReturnValue(errorGenerator());

      const chunks: AIStreamChunk[] = [];
      await expect(async () => {
        for await (const chunk of service.generateStream(messages)) {
          chunks.push(chunk);
        }
      }).rejects.toThrow('Stream error');
    });
  });
});
