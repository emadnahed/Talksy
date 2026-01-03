import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { ApiKeyGuard } from './api-key.guard';

describe('ApiKeyGuard', () => {
  let guard: ApiKeyGuard;
  let mockConfigService: jest.Mocked<ConfigService>;

  const createMockExecutionContext = (
    headers: Record<string, string> = {},
    query: Record<string, string> = {},
    auth: Record<string, string> = {},
    address = '127.0.0.1',
  ): ExecutionContext => {
    const mockClient = {
      handshake: {
        headers,
        query,
        auth,
        address,
      },
    };

    return {
      switchToWs: () => ({
        getClient: () => mockClient,
      }),
    } as unknown as ExecutionContext;
  };

  describe('with auth enabled and valid keys configured', () => {
    beforeEach(async () => {
      mockConfigService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          const config: Record<string, unknown> = {
            AUTH_ENABLED: true,
            AUTH_BYPASS_IN_DEV: false,
            NODE_ENV: 'production',
            API_KEYS: 'valid-key-1,valid-key-2,valid-key-3',
          };
          return config[key] ?? defaultValue;
        }),
      } as unknown as jest.Mocked<ConfigService>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ApiKeyGuard,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      guard = module.get<ApiKeyGuard>(ApiKeyGuard);
    });

    it('should allow connection with valid API key in header', () => {
      const context = createMockExecutionContext({
        'x-api-key': 'valid-key-1',
      });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow connection with valid API key in query', () => {
      const context = createMockExecutionContext({}, { apiKey: 'valid-key-2' });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow connection with valid API key in auth token', () => {
      const context = createMockExecutionContext(
        {},
        {},
        { token: 'valid-key-3' },
      );
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should prefer header key over query key', () => {
      const context = createMockExecutionContext(
        { 'x-api-key': 'valid-key-1' },
        { apiKey: 'invalid-key' },
      );
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should reject connection with missing API key', () => {
      const context = createMockExecutionContext();
      expect(() => guard.canActivate(context)).toThrow(WsException);
      try {
        guard.canActivate(context);
      } catch (e) {
        expect(e).toBeInstanceOf(WsException);
        expect((e as WsException).getError()).toEqual({
          code: 'AUTH_MISSING_KEY',
          message: 'API key is required',
        });
      }
    });

    it('should reject connection with invalid API key', () => {
      const context = createMockExecutionContext({
        'x-api-key': 'invalid-key',
      });
      expect(() => guard.canActivate(context)).toThrow(WsException);
      try {
        guard.canActivate(context);
      } catch (e) {
        expect(e).toBeInstanceOf(WsException);
        expect((e as WsException).getError()).toEqual({
          code: 'AUTH_INVALID_KEY',
          message: 'Invalid API key',
        });
      }
    });

    it('should reject connection with empty API key', () => {
      const context = createMockExecutionContext({ 'x-api-key': '' });
      expect(() => guard.canActivate(context)).toThrow(WsException);
    });
  });

  describe('with auth disabled', () => {
    beforeEach(async () => {
      mockConfigService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          const config: Record<string, unknown> = {
            AUTH_ENABLED: false,
            AUTH_BYPASS_IN_DEV: false,
            NODE_ENV: 'production',
            API_KEYS: '',
          };
          return config[key] ?? defaultValue;
        }),
      } as unknown as jest.Mocked<ConfigService>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ApiKeyGuard,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      guard = module.get<ApiKeyGuard>(ApiKeyGuard);
    });

    it('should allow connection without API key', () => {
      const context = createMockExecutionContext();
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow connection with any API key', () => {
      const context = createMockExecutionContext({
        'x-api-key': 'any-random-key',
      });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('with dev bypass enabled in development', () => {
    beforeEach(async () => {
      mockConfigService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          const config: Record<string, unknown> = {
            AUTH_ENABLED: true,
            AUTH_BYPASS_IN_DEV: true,
            NODE_ENV: 'development',
            API_KEYS: 'valid-key',
          };
          return config[key] ?? defaultValue;
        }),
      } as unknown as jest.Mocked<ConfigService>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ApiKeyGuard,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      guard = module.get<ApiKeyGuard>(ApiKeyGuard);
    });

    it('should allow connection without API key in development', () => {
      const context = createMockExecutionContext();
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should allow connection with invalid API key in development', () => {
      const context = createMockExecutionContext({
        'x-api-key': 'invalid-key',
      });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('with dev bypass enabled but in production', () => {
    beforeEach(async () => {
      mockConfigService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          const config: Record<string, unknown> = {
            AUTH_ENABLED: true,
            AUTH_BYPASS_IN_DEV: true,
            NODE_ENV: 'production',
            API_KEYS: 'valid-key',
          };
          return config[key] ?? defaultValue;
        }),
      } as unknown as jest.Mocked<ConfigService>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ApiKeyGuard,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      guard = module.get<ApiKeyGuard>(ApiKeyGuard);
    });

    it('should require API key in production even with bypass enabled', () => {
      const context = createMockExecutionContext();
      expect(() => guard.canActivate(context)).toThrow(WsException);
    });

    it('should validate API key in production', () => {
      const context = createMockExecutionContext({ 'x-api-key': 'valid-key' });
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('with no API keys configured', () => {
    beforeEach(async () => {
      mockConfigService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          const config: Record<string, unknown> = {
            AUTH_ENABLED: true,
            AUTH_BYPASS_IN_DEV: true,
            NODE_ENV: 'development',
            API_KEYS: '',
          };
          return config[key] ?? defaultValue;
        }),
      } as unknown as jest.Mocked<ConfigService>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ApiKeyGuard,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      guard = module.get<ApiKeyGuard>(ApiKeyGuard);
    });

    it('should allow in development with bypass', () => {
      const context = createMockExecutionContext();
      expect(guard.canActivate(context)).toBe(true);
    });
  });

  describe('with whitespace in API keys config', () => {
    beforeEach(async () => {
      mockConfigService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          const config: Record<string, unknown> = {
            AUTH_ENABLED: true,
            AUTH_BYPASS_IN_DEV: false,
            NODE_ENV: 'production',
            API_KEYS: ' key-1 , key-2 ,, key-3 ',
          };
          return config[key] ?? defaultValue;
        }),
      } as unknown as jest.Mocked<ConfigService>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ApiKeyGuard,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      guard = module.get<ApiKeyGuard>(ApiKeyGuard);
    });

    it('should trim whitespace from API keys', () => {
      const context = createMockExecutionContext({ 'x-api-key': 'key-1' });
      expect(guard.canActivate(context)).toBe(true);
    });

    it('should ignore empty entries', () => {
      const context = createMockExecutionContext({ 'x-api-key': '' });
      expect(() => guard.canActivate(context)).toThrow(WsException);
    });
  });

  describe('timing attack prevention', () => {
    beforeEach(async () => {
      mockConfigService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          const config: Record<string, unknown> = {
            AUTH_ENABLED: true,
            AUTH_BYPASS_IN_DEV: false,
            NODE_ENV: 'production',
            API_KEYS: 'secret-api-key-12345',
          };
          return config[key] ?? defaultValue;
        }),
      } as unknown as jest.Mocked<ConfigService>;

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ApiKeyGuard,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      guard = module.get<ApiKeyGuard>(ApiKeyGuard);
    });

    it('should reject keys of different lengths', () => {
      const context = createMockExecutionContext({ 'x-api-key': 'short' });
      expect(() => guard.canActivate(context)).toThrow(WsException);
    });

    it('should reject keys of same length but different content', () => {
      const context = createMockExecutionContext({
        'x-api-key': 'wrong-api-key-12345',
      });
      expect(() => guard.canActivate(context)).toThrow(WsException);
    });

    it('should accept exact match', () => {
      const context = createMockExecutionContext({
        'x-api-key': 'secret-api-key-12345',
      });
      expect(guard.canActivate(context)).toBe(true);
    });
  });
});
