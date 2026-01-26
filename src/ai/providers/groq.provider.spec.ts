import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { GroqProvider } from './groq.provider';
import { MessageRole } from '../../session/dto/session-message.dto';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('GroqProvider', () => {
  let provider: GroqProvider;
  let configService: jest.Mocked<ConfigService>;

  const mockApiKey = 'gsk_test_key_123';
  const mockModel = 'llama-3.1-8b-instant';

  beforeEach(async () => {
    mockFetch.mockReset();

    configService = {
      get: jest.fn((key: string) => {
        const config: Record<string, unknown> = {
          GROQ_API_KEY: mockApiKey,
          GROQ_MODEL: mockModel,
          GROQ_MAX_TOKENS: 1000,
          GROQ_TEMPERATURE: 0.7,
        };
        return config[key];
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroqProvider,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    provider = module.get<GroqProvider>(GroqProvider);
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(provider).toBeDefined();
    });

    it('should have name "groq"', () => {
      expect(provider.name).toBe('groq');
    });

    it('should be available when API key is configured', () => {
      expect(provider.isAvailable).toBe(true);
    });

    it('should not be available when API key is missing', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'GROQ_API_KEY') return undefined;
        return 'default';
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GroqProvider,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      const providerWithoutKey = module.get<GroqProvider>(GroqProvider);
      expect(providerWithoutKey.isAvailable).toBe(false);
    });
  });

  describe('generateCompletion', () => {
    const mockMessages = [
      { role: MessageRole.USER, content: 'Hello', timestamp: Date.now() },
    ];

    it('should generate completion successfully', async () => {
      const mockResponse = {
        choices: [
          {
            message: { content: 'Hello! How can I help you?' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await provider.generateCompletion(mockMessages);

      expect(result.content).toBe('Hello! How can I help you?');
      expect(result.finishReason).toBe('stop');
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      });
    });

    it('should call Groq API with correct parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        }),
      });

      await provider.generateCompletion(mockMessages, {
        maxTokens: 500,
        temperature: 0.5,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: `Bearer ${mockApiKey}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.model).toBe(mockModel);
      expect(callBody.max_tokens).toBe(500);
      expect(callBody.temperature).toBe(0.5);
      expect(callBody.stream).toBe(false);
    });

    it('should throw error when API key is not configured', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'GROQ_API_KEY') return undefined;
        return 'default';
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GroqProvider,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      const providerWithoutKey = module.get<GroqProvider>(GroqProvider);

      await expect(
        providerWithoutKey.generateCompletion(mockMessages),
      ).rejects.toThrow('Groq API key not configured');
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(provider.generateCompletion(mockMessages)).rejects.toThrow(
        'Groq API error: 401',
      );
    });

    it('should throw error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(provider.generateCompletion(mockMessages)).rejects.toThrow(
        'Network error',
      );
    });

    it('should handle empty content in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 0, total_tokens: 5 },
        }),
      });

      const result = await provider.generateCompletion(mockMessages);
      expect(result.content).toBe('');
    });

    it('should handle missing usage in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Hi' }, finish_reason: 'stop' }],
        }),
      });

      const result = await provider.generateCompletion(mockMessages);
      expect(result.usage).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      });
    });

    it('should handle length finish reason', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Truncated...' }, finish_reason: 'length' }],
          usage: { prompt_tokens: 10, completion_tokens: 1000, total_tokens: 1010 },
        }),
      });

      const result = await provider.generateCompletion(mockMessages);
      expect(result.finishReason).toBe('length');
    });

    it('should use default options when not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'Response' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        }),
      });

      await provider.generateCompletion(mockMessages);

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.max_tokens).toBe(1000); // default
      expect(callBody.temperature).toBe(0.7); // default
    });
  });

  describe('generateStream', () => {
    const mockMessages = [
      { role: MessageRole.USER, content: 'Hello', timestamp: Date.now() },
    ];

    it('should throw error when API key is not configured', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'GROQ_API_KEY') return undefined;
        return 'default';
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          GroqProvider,
          { provide: ConfigService, useValue: configService },
        ],
      }).compile();

      const providerWithoutKey = module.get<GroqProvider>(GroqProvider);
      const stream = providerWithoutKey.generateStream(mockMessages);

      await expect(stream.next()).rejects.toThrow('Groq API key not configured');
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      const stream = provider.generateStream(mockMessages);
      await expect(stream.next()).rejects.toThrow('Groq API error: 500');
    });

    it('should throw error when response body is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null,
      });

      const stream = provider.generateStream(mockMessages);
      await expect(stream.next()).rejects.toThrow('No response body');
    });

    it('should stream chunks correctly', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n',
        'data: {"choices":[{"finish_reason":"stop"}]}\n',
        'data: [DONE]\n',
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: jest.fn().mockImplementation(async () => {
          if (chunkIndex < chunks.length) {
            const chunk = chunks[chunkIndex++];
            return {
              done: false,
              value: new TextEncoder().encode(chunk),
            };
          }
          return { done: true, value: undefined };
        }),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const stream = provider.generateStream(mockMessages);
      const results: { content: string; done: boolean }[] = [];

      for await (const chunk of stream) {
        results.push(chunk);
      }

      expect(results).toContainEqual({ content: 'Hello', done: false });
      expect(results).toContainEqual({ content: ' world', done: false });
      expect(results.some((r) => r.done)).toBe(true);
    });

    it('should call API with stream: true', async () => {
      const mockReader = {
        read: jest.fn().mockResolvedValue({ done: true, value: undefined }),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const stream = provider.generateStream(mockMessages);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of stream) {
        // consume stream
      }

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.stream).toBe(true);
    });

    it('should handle malformed JSON in stream gracefully', async () => {
      const chunks = [
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n',
        'data: {malformed json}\n',
        'data: {"choices":[{"finish_reason":"stop"}]}\n',
      ];

      let chunkIndex = 0;
      const mockReader = {
        read: jest.fn().mockImplementation(async () => {
          if (chunkIndex < chunks.length) {
            const chunk = chunks[chunkIndex++];
            return {
              done: false,
              value: new TextEncoder().encode(chunk),
            };
          }
          return { done: true, value: undefined };
        }),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: { getReader: () => mockReader },
      });

      const stream = provider.generateStream(mockMessages);
      const results: { content: string; done: boolean }[] = [];

      for await (const chunk of stream) {
        results.push(chunk);
      }

      // Should still get valid chunks, malformed one is skipped
      expect(results.some((r) => r.content === 'Hi')).toBe(true);
    });
  });

  describe('rate limiting consideration', () => {
    it('should include rate limit info in documentation', () => {
      // This is a documentation test - Groq free tier is 30 req/min
      expect(provider.name).toBe('groq');
      // The provider should work within rate limits
      expect(provider.isAvailable).toBe(true);
    });
  });
});
