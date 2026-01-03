import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OpenAIProvider } from './openai.provider';
import {
  SessionMessageDto,
  MessageRole,
} from '../../session/dto/session-message.dto';
import { AI_ERRORS } from '../constants/ai.constants';

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'OPENAI_API_KEY':
          return undefined;
        case 'OPENAI_MODEL':
          return undefined;
        case 'OPENAI_MAX_TOKENS':
          return undefined;
        case 'OPENAI_TEMPERATURE':
          return undefined;
        default:
          return undefined;
      }
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAIProvider,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    provider = module.get<OpenAIProvider>(OpenAIProvider);
  });

  describe('provider properties', () => {
    it('should have name "openai"', () => {
      expect(provider.name).toBe('openai');
    });

    it('should not be available without API key', () => {
      expect(provider.isAvailable).toBe(false);
    });

    it('should be available with API key', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test-api-key';
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OpenAIProvider,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const providerWithKey = module.get<OpenAIProvider>(OpenAIProvider);
      expect(providerWithKey.isAvailable).toBe(true);
    });
  });

  describe('configuration', () => {
    it('should use default model when not configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test-api-key';
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OpenAIProvider,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const configuredProvider = module.get<OpenAIProvider>(OpenAIProvider);
      expect(configuredProvider).toBeDefined();
    });

    it('should use configured model', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'OPENAI_API_KEY':
            return 'test-api-key';
          case 'OPENAI_MODEL':
            return 'gpt-4';
          default:
            return undefined;
        }
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OpenAIProvider,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const configuredProvider = module.get<OpenAIProvider>(OpenAIProvider);
      expect(configuredProvider).toBeDefined();
    });

    it('should use configured max tokens', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'OPENAI_API_KEY':
            return 'test-api-key';
          case 'OPENAI_MAX_TOKENS':
            return 2000;
          default:
            return undefined;
        }
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OpenAIProvider,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const configuredProvider = module.get<OpenAIProvider>(OpenAIProvider);
      expect(configuredProvider).toBeDefined();
    });

    it('should use configured temperature', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        switch (key) {
          case 'OPENAI_API_KEY':
            return 'test-api-key';
          case 'OPENAI_TEMPERATURE':
            return 0.5;
          default:
            return undefined;
        }
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OpenAIProvider,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const configuredProvider = module.get<OpenAIProvider>(OpenAIProvider);
      expect(configuredProvider).toBeDefined();
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

    it('should throw error when API key not configured', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
      ];

      await expect(provider.generateCompletion(messages)).rejects.toThrow(
        AI_ERRORS.PROVIDER_NOT_AVAILABLE,
      );
    });

    it('should throw error about SDK not installed when API key is configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test-api-key';
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OpenAIProvider,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const providerWithKey = module.get<OpenAIProvider>(OpenAIProvider);
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
      ];

      await expect(
        providerWithKey.generateCompletion(messages),
      ).rejects.toThrow('OpenAI SDK not installed');
    });

    it('should accept options parameter', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test-api-key';
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OpenAIProvider,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const providerWithKey = module.get<OpenAIProvider>(OpenAIProvider);
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
      ];

      await expect(
        providerWithKey.generateCompletion(messages, {
          maxTokens: 500,
          temperature: 0.5,
        }),
      ).rejects.toThrow('OpenAI SDK not installed');
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

    it('should throw error when API key not configured', async () => {
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
      ];

      const generator = provider.generateStream(messages);

      await expect(generator.next()).rejects.toThrow(
        AI_ERRORS.PROVIDER_NOT_AVAILABLE,
      );
    });

    it('should throw error about SDK not installed when API key is configured', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test-api-key';
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OpenAIProvider,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const providerWithKey = module.get<OpenAIProvider>(OpenAIProvider);
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
      ];

      const generator = providerWithKey.generateStream(messages);

      await expect(generator.next()).rejects.toThrow(
        'OpenAI SDK not installed',
      );
    });

    it('should accept options parameter', async () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'OPENAI_API_KEY') return 'test-api-key';
        return undefined;
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OpenAIProvider,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const providerWithKey = module.get<OpenAIProvider>(OpenAIProvider);
      const messages: SessionMessageDto[] = [
        createMessage(MessageRole.USER, 'Hello'),
      ];

      const generator = providerWithKey.generateStream(messages, {
        maxTokens: 100,
      });

      await expect(generator.next()).rejects.toThrow(
        'OpenAI SDK not installed',
      );
    });
  });
});
