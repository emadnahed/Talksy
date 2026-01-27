import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisPoolService } from './redis-pool.service';

describe('RedisPoolService', () => {
  let service: RedisPoolService;
  let configService: ConfigService;

  const createMockConfigService = (overrides: Record<string, unknown> = {}) => {
    const defaultConfig: Record<string, unknown> = {
      REDIS_ENABLED: false,
      REDIS_HOST: 'localhost',
      REDIS_PORT: 6379,
      REDIS_PASSWORD: '',
      REDIS_DB: 0,
      REDIS_KEY_PREFIX: 'talksy:',
      ...overrides,
    };

    return {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        return defaultConfig[key] ?? defaultValue;
      }),
    };
  };

  describe('when Redis is disabled', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisPoolService,
          {
            provide: ConfigService,
            useValue: createMockConfigService({ REDIS_ENABLED: false }),
          },
        ],
      }).compile();

      service = module.get<RedisPoolService>(RedisPoolService);
      configService = module.get<ConfigService>(ConfigService);
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should report disabled status', () => {
      expect(service.isEnabled()).toBe(false);
    });

    it('should return false for isAvailable', () => {
      expect(service.isAvailable()).toBe(false);
    });

    it('should return null for getClient', () => {
      expect(service.getClient()).toBeNull();
    });

    it('should return key prefix', () => {
      expect(service.getKeyPrefix()).toBe('talksy:');
    });

    it('should return false for connect when disabled', async () => {
      const result = await service.connect();
      expect(result).toBe(false);
    });

    it('should log warning on module init when disabled', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'warn');
      await service.onModuleInit();
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Redis disabled'),
      );
    });

    it('should return false for isHealthy when disabled', async () => {
      const result = await service.isHealthy();
      expect(result).toBe(false);
    });

    it('should return null for getLatency when disabled', async () => {
      const result = await service.getLatency();
      expect(result).toBeNull();
    });

    it('should handle disconnect gracefully when not connected', async () => {
      await expect(service.disconnect()).resolves.not.toThrow();
    });
  });

  describe('when Redis is enabled (string "true")', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisPoolService,
          {
            provide: ConfigService,
            useValue: createMockConfigService({ REDIS_ENABLED: 'true' }),
          },
        ],
      }).compile();

      service = module.get<RedisPoolService>(RedisPoolService);
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it('should recognize string "true" as enabled', () => {
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('when Redis is enabled (boolean true)', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisPoolService,
          {
            provide: ConfigService,
            useValue: createMockConfigService({ REDIS_ENABLED: true }),
          },
        ],
      }).compile();

      service = module.get<RedisPoolService>(RedisPoolService);
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it('should recognize boolean true as enabled', () => {
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('configuration parsing', () => {
    it('should use custom configuration values', async () => {
      const customConfig = {
        REDIS_ENABLED: false,
        REDIS_HOST: 'custom-host',
        REDIS_PORT: 6380,
        REDIS_PASSWORD: 'secret-password',
        REDIS_DB: 2,
        REDIS_KEY_PREFIX: 'custom:prefix:',
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisPoolService,
          {
            provide: ConfigService,
            useValue: createMockConfigService(customConfig),
          },
        ],
      }).compile();

      const customService = module.get<RedisPoolService>(RedisPoolService);

      expect(customService.getKeyPrefix()).toBe('custom:prefix:');
      expect(customService.isEnabled()).toBe(false);

      await customService.onModuleDestroy();
    });

    it('should handle empty password as undefined', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisPoolService,
          {
            provide: ConfigService,
            useValue: createMockConfigService({
              REDIS_ENABLED: false,
              REDIS_PASSWORD: '',
            }),
          },
        ],
      }).compile();

      const serviceWithNoPassword = module.get<RedisPoolService>(RedisPoolService);
      // Internal config should have undefined password
      expect(serviceWithNoPassword['config'].password).toBeUndefined();

      await serviceWithNoPassword.onModuleDestroy();
    });
  });

  describe('connection idempotency', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisPoolService,
          {
            provide: ConfigService,
            useValue: createMockConfigService({ REDIS_ENABLED: false }),
          },
        ],
      }).compile();

      service = module.get<RedisPoolService>(RedisPoolService);
    });

    afterEach(async () => {
      await service.onModuleDestroy();
    });

    it('should return same result for multiple connect calls when disabled', async () => {
      const results = await Promise.all([
        service.connect(),
        service.connect(),
        service.connect(),
      ]);

      expect(results).toEqual([false, false, false]);
    });
  });

  describe('disconnect behavior', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RedisPoolService,
          {
            provide: ConfigService,
            useValue: createMockConfigService({ REDIS_ENABLED: false }),
          },
        ],
      }).compile();

      service = module.get<RedisPoolService>(RedisPoolService);
    });

    it('should handle multiple disconnect calls gracefully', async () => {
      await expect(service.disconnect()).resolves.not.toThrow();
      await expect(service.disconnect()).resolves.not.toThrow();
      await expect(service.disconnect()).resolves.not.toThrow();
    });

    it('should clear state after disconnect', async () => {
      await service.disconnect();
      expect(service.getClient()).toBeNull();
      expect(service.isAvailable()).toBe(false);
    });
  });
});

describe('RedisPoolService with Mock Redis Client', () => {
  let service: RedisPoolService;
  let mockRedisClient: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisPoolService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              const config: Record<string, unknown> = {
                REDIS_ENABLED: true,
                REDIS_HOST: 'localhost',
                REDIS_PORT: 6379,
                REDIS_PASSWORD: '',
                REDIS_DB: 0,
                REDIS_KEY_PREFIX: 'talksy:',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RedisPoolService>(RedisPoolService);

    // Create mock Redis client
    mockRedisClient = {
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('simulated connected state', () => {
    beforeEach(() => {
      // Simulate connected state by setting internal properties
      service['primaryClient'] = mockRedisClient;
      service['isConnected'] = true;
    });

    it('should return the client when connected', () => {
      const client = service.getClient();
      expect(client).toBe(mockRedisClient);
    });

    it('should report available when connected', () => {
      expect(service.isAvailable()).toBe(true);
    });

    it('should return true for isHealthy when ping succeeds', async () => {
      mockRedisClient.ping.mockResolvedValue('PONG');
      const result = await service.isHealthy();
      expect(result).toBe(true);
      expect(mockRedisClient.ping).toHaveBeenCalled();
    });

    it('should return false for isHealthy when ping fails', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Connection lost'));
      const result = await service.isHealthy();
      expect(result).toBe(false);
    });

    it('should return false for isHealthy when ping returns non-PONG', async () => {
      mockRedisClient.ping.mockResolvedValue('NOT-PONG');
      const result = await service.isHealthy();
      expect(result).toBe(false);
    });

    it('should return latency in milliseconds', async () => {
      mockRedisClient.ping.mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return 'PONG';
      });

      const latency = await service.getLatency();
      expect(latency).toBeGreaterThanOrEqual(0);
      expect(typeof latency).toBe('number');
    });

    it('should return null for getLatency when ping fails', async () => {
      mockRedisClient.ping.mockRejectedValue(new Error('Connection lost'));
      const result = await service.getLatency();
      expect(result).toBeNull();
    });

    it('should disconnect and clear state', async () => {
      await service.disconnect();

      expect(mockRedisClient.quit).toHaveBeenCalled();
      expect(service.getClient()).toBeNull();
      expect(service.isAvailable()).toBe(false);
    });

    it('should handle quit error during disconnect', async () => {
      mockRedisClient.quit.mockRejectedValue(new Error('Quit failed'));
      const loggerSpy = jest.spyOn(service['logger'], 'warn');

      await service.disconnect();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error disconnecting'),
      );
      expect(service.getClient()).toBeNull();
    });
  });

  describe('simulated not connected state', () => {
    beforeEach(() => {
      service['primaryClient'] = mockRedisClient;
      service['isConnected'] = false;
    });

    it('should return null for getClient when not connected', () => {
      expect(service.getClient()).toBeNull();
    });

    it('should return false for isAvailable when not connected', () => {
      expect(service.isAvailable()).toBe(false);
    });

    it('should return false for isHealthy when not connected', async () => {
      const result = await service.isHealthy();
      expect(result).toBe(false);
      expect(mockRedisClient.ping).not.toHaveBeenCalled();
    });

    it('should return null for getLatency when not connected', async () => {
      const result = await service.getLatency();
      expect(result).toBeNull();
      expect(mockRedisClient.ping).not.toHaveBeenCalled();
    });
  });

  describe('simulated null client state', () => {
    beforeEach(() => {
      service['primaryClient'] = null;
      service['isConnected'] = true;
    });

    it('should return null for getClient when client is null', () => {
      expect(service.getClient()).toBeNull();
    });

    it('should return false for isAvailable when client is null', () => {
      expect(service.isAvailable()).toBe(false);
    });

    it('should return false for isHealthy when client is null', async () => {
      const result = await service.isHealthy();
      expect(result).toBe(false);
    });

    it('should return null for getLatency when client is null', async () => {
      const result = await service.getLatency();
      expect(result).toBeNull();
    });
  });
});

describe('RedisPoolService connection scenarios', () => {
  let service: RedisPoolService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisPoolService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              const config: Record<string, unknown> = {
                REDIS_ENABLED: true,
                REDIS_HOST: 'localhost',
                REDIS_PORT: 6379,
                REDIS_PASSWORD: '',
                REDIS_DB: 0,
                REDIS_KEY_PREFIX: 'test:',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RedisPoolService>(RedisPoolService);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('should return true for already connected state', async () => {
    // Simulate already connected state
    service['isConnected'] = true;
    service['primaryClient'] = { ping: jest.fn() } as any;

    const result = await service.connect();
    expect(result).toBe(true);
  });

  it('should handle concurrent connect calls', async () => {
    // This tests the connectionPromise deduplication
    const mockClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
    };

    // Mock Redis constructor
    const originalDoConnect = service['doConnect'].bind(service);
    let connectCalls = 0;
    service['doConnect'] = jest.fn().mockImplementation(async () => {
      connectCalls++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      service['primaryClient'] = mockClient as any;
      service['isConnected'] = true;
      return true;
    });

    // Launch multiple concurrent connects
    const results = await Promise.all([
      service.connect(),
      service.connect(),
      service.connect(),
    ]);

    // All should resolve to the same result
    expect(results).toEqual([true, true, true]);
    // But doConnect should only be called once due to connectionPromise
    expect(connectCalls).toBe(1);
  });
});
