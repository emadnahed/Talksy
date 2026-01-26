import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RateLimitService } from './rate-limit.service';

describe('RateLimitService', () => {
  let service: RateLimitService;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const config: Record<string, unknown> = {
          RATE_LIMIT_ENABLED: true,
          RATE_LIMIT_WINDOW_MS: 60000,
          RATE_LIMIT_MAX_REQUESTS: 10,
        };
        return config[key] ?? defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('isEnabled', () => {
    it('should return true when rate limiting is enabled', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('should return false when rate limiting is disabled', async () => {
      const disabledConfigService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          if (key === 'RATE_LIMIT_ENABLED') return false;
          return defaultValue;
        }),
      };

      const module = await Test.createTestingModule({
        providers: [
          RateLimitService,
          { provide: ConfigService, useValue: disabledConfigService },
        ],
      }).compile();

      const disabledService = module.get<RateLimitService>(RateLimitService);
      expect(disabledService.isEnabled()).toBe(false);
      disabledService.onModuleDestroy();
    });
  });

  describe('getConfig', () => {
    it('should return the current configuration', () => {
      const config = service.getConfig();
      expect(config).toEqual({
        enabled: true,
        windowMs: 60000,
        maxRequests: 10,
      });
    });
  });

  describe('checkLimit', () => {
    it('should allow first request', () => {
      const result = service.checkLimit('client-1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(10);
    });

    it('should not consume when just checking', () => {
      service.checkLimit('client-1');
      service.checkLimit('client-1');
      service.checkLimit('client-1');

      expect(service.getRequestCount('client-1')).toBe(0);
    });

    it('should return correct remaining count after recording requests', () => {
      service.recordRequest('client-1');
      service.recordRequest('client-1');
      service.recordRequest('client-1');

      const result = service.checkLimit('client-1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(7);
    });

    it('should deny when limit is exceeded', () => {
      // Record 10 requests
      for (let i = 0; i < 10; i++) {
        service.recordRequest('client-1');
      }

      const result = service.checkLimit('client-1');
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should allow requests when disabled', async () => {
      const disabledConfigService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          if (key === 'RATE_LIMIT_ENABLED') return false;
          return defaultValue;
        }),
      };

      const module = await Test.createTestingModule({
        providers: [
          RateLimitService,
          { provide: ConfigService, useValue: disabledConfigService },
        ],
      }).compile();

      const disabledService = module.get<RateLimitService>(RateLimitService);

      // Even with many requests recorded, should allow
      for (let i = 0; i < 100; i++) {
        const result = disabledService.checkLimit('client-1');
        expect(result.allowed).toBe(true);
      }

      disabledService.onModuleDestroy();
    });
  });

  describe('recordRequest', () => {
    it('should record a request for a client', () => {
      service.recordRequest('client-1');
      expect(service.getRequestCount('client-1')).toBe(1);
    });

    it('should record multiple requests', () => {
      service.recordRequest('client-1');
      service.recordRequest('client-1');
      service.recordRequest('client-1');
      expect(service.getRequestCount('client-1')).toBe(3);
    });

    it('should track requests per client independently', () => {
      service.recordRequest('client-1');
      service.recordRequest('client-1');
      service.recordRequest('client-2');

      expect(service.getRequestCount('client-1')).toBe(2);
      expect(service.getRequestCount('client-2')).toBe(1);
    });

    it('should not record when disabled', async () => {
      const disabledConfigService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          if (key === 'RATE_LIMIT_ENABLED') return false;
          return defaultValue;
        }),
      };

      const module = await Test.createTestingModule({
        providers: [
          RateLimitService,
          { provide: ConfigService, useValue: disabledConfigService },
        ],
      }).compile();

      const disabledService = module.get<RateLimitService>(RateLimitService);

      disabledService.recordRequest('client-1');
      expect(disabledService.getRequestCount('client-1')).toBe(0);

      disabledService.onModuleDestroy();
    });
  });

  describe('consume', () => {
    it('should check and record in one operation', () => {
      const result = service.consume('client-1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(service.getRequestCount('client-1')).toBe(1);
    });

    it('should decrement remaining with each consume', () => {
      const result1 = service.consume('client-1');
      const result2 = service.consume('client-1');
      const result3 = service.consume('client-1');

      expect(result1.remaining).toBe(9);
      expect(result2.remaining).toBe(8);
      expect(result3.remaining).toBe(7);
    });

    it('should deny and not record when limit exceeded', () => {
      // Consume 10 requests
      for (let i = 0; i < 10; i++) {
        service.consume('client-1');
      }

      const result = service.consume('client-1');
      expect(result.allowed).toBe(false);
      expect(service.getRequestCount('client-1')).toBe(10);
    });
  });

  describe('getRequestCount', () => {
    it('should return 0 for unknown client', () => {
      expect(service.getRequestCount('unknown')).toBe(0);
    });

    it('should return current count', () => {
      service.recordRequest('client-1');
      service.recordRequest('client-1');
      expect(service.getRequestCount('client-1')).toBe(2);
    });
  });

  describe('resetClient', () => {
    it('should reset rate limit for a client', () => {
      service.recordRequest('client-1');
      service.recordRequest('client-1');
      expect(service.getRequestCount('client-1')).toBe(2);

      service.resetClient('client-1');
      expect(service.getRequestCount('client-1')).toBe(0);
    });

    it('should not affect other clients', () => {
      service.recordRequest('client-1');
      service.recordRequest('client-2');

      service.resetClient('client-1');

      expect(service.getRequestCount('client-1')).toBe(0);
      expect(service.getRequestCount('client-2')).toBe(1);
    });
  });

  describe('clearAll', () => {
    it('should clear all rate limit data', () => {
      service.recordRequest('client-1');
      service.recordRequest('client-2');
      service.recordRequest('client-3');

      service.clearAll();

      expect(service.getRequestCount('client-1')).toBe(0);
      expect(service.getRequestCount('client-2')).toBe(0);
      expect(service.getRequestCount('client-3')).toBe(0);
    });
  });

  describe('sliding window behavior', () => {
    it('should expire old requests outside the window', () => {
      jest.useFakeTimers();

      // Record 5 requests
      for (let i = 0; i < 5; i++) {
        service.recordRequest('client-1');
      }

      expect(service.getRequestCount('client-1')).toBe(5);

      // Advance time past the window
      jest.advanceTimersByTime(61000);

      expect(service.getRequestCount('client-1')).toBe(0);

      jest.useRealTimers();
    });

    it('should allow new requests after old ones expire', () => {
      jest.useFakeTimers();

      // Fill up the limit
      for (let i = 0; i < 10; i++) {
        service.recordRequest('client-1');
      }

      const blockedResult = service.checkLimit('client-1');
      expect(blockedResult.allowed).toBe(false);

      // Advance time past the window
      jest.advanceTimersByTime(61000);

      const allowedResult = service.checkLimit('client-1');
      expect(allowedResult.allowed).toBe(true);
      expect(allowedResult.remaining).toBe(10);

      jest.useRealTimers();
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear all data on destroy', () => {
      service.recordRequest('client-1');
      expect(service.getRequestCount('client-1')).toBe(1);

      service.onModuleDestroy();

      expect(service.getRequestCount('client-1')).toBe(0);
    });
  });

  describe('cleanup interval', () => {
    it('should automatically clean up old entries via interval', async () => {
      jest.useFakeTimers();

      // Create a service with a short cleanup interval for testing
      const shortWindowConfigService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          const config: Record<string, unknown> = {
            RATE_LIMIT_ENABLED: true,
            RATE_LIMIT_WINDOW_MS: 100, // Very short window for testing
            RATE_LIMIT_MAX_REQUESTS: 10,
          };
          return config[key] ?? defaultValue;
        }),
      };

      const module = await Test.createTestingModule({
        providers: [
          RateLimitService,
          { provide: ConfigService, useValue: shortWindowConfigService },
        ],
      }).compile();

      const shortService = module.get<RateLimitService>(RateLimitService);

      // Record a request
      shortService.recordRequest('client-1');
      expect(shortService.getRequestCount('client-1')).toBe(1);

      // Advance time past the window so entries expire
      jest.advanceTimersByTime(150);

      // Trigger the cleanup by advancing time to when the interval fires
      jest.advanceTimersByTime(100);

      // Requests should be cleaned up
      expect(shortService.getRequestCount('client-1')).toBe(0);

      shortService.onModuleDestroy();
      jest.useRealTimers();
    });

    it('should clean up entries when timestamps are partially removed', async () => {
      jest.useFakeTimers();

      const shortWindowConfigService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          const config: Record<string, unknown> = {
            RATE_LIMIT_ENABLED: true,
            RATE_LIMIT_WINDOW_MS: 100,
            RATE_LIMIT_MAX_REQUESTS: 10,
          };
          return config[key] ?? defaultValue;
        }),
      };

      const module = await Test.createTestingModule({
        providers: [
          RateLimitService,
          { provide: ConfigService, useValue: shortWindowConfigService },
        ],
      }).compile();

      const shortService = module.get<RateLimitService>(RateLimitService);

      // Record first request
      shortService.recordRequest('client-1');

      // Advance time but not past the window
      jest.advanceTimersByTime(50);

      // Record second request
      shortService.recordRequest('client-1');

      // Advance time past first request window but not second
      jest.advanceTimersByTime(60);

      // Now the first request is expired, second is still valid
      // This will update lastCleanup when some but not all timestamps are removed
      expect(shortService.getRequestCount('client-1')).toBe(1);

      shortService.onModuleDestroy();
      jest.useRealTimers();
    });

    it('should remove client completely when all timestamps expire', async () => {
      jest.useFakeTimers();

      const shortWindowConfigService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          const config: Record<string, unknown> = {
            RATE_LIMIT_ENABLED: true,
            RATE_LIMIT_WINDOW_MS: 100,
            RATE_LIMIT_MAX_REQUESTS: 10,
          };
          return config[key] ?? defaultValue;
        }),
      };

      const module = await Test.createTestingModule({
        providers: [
          RateLimitService,
          { provide: ConfigService, useValue: shortWindowConfigService },
        ],
      }).compile();

      const shortService = module.get<RateLimitService>(RateLimitService);

      // Record requests
      shortService.recordRequest('client-1');
      shortService.recordRequest('client-2');

      // Advance time past window
      jest.advanceTimersByTime(150);

      // Force cleanup interval
      jest.advanceTimersByTime(100);

      // Both clients should be cleaned up completely
      expect(shortService.getRequestCount('client-1')).toBe(0);
      expect(shortService.getRequestCount('client-2')).toBe(0);

      shortService.onModuleDestroy();
      jest.useRealTimers();
    });
  });
});
