import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { StorageService } from './storage.service';
import { InMemoryStorageAdapter } from './adapters/in-memory-storage.adapter';
import { RedisStorageAdapter } from './adapters/redis-storage.adapter';
import { Session } from '@/session/interfaces/session.interface';

describe('StorageService', () => {
  let service: StorageService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockInMemoryAdapter: jest.Mocked<InMemoryStorageAdapter>;
  let mockRedisAdapter: jest.Mocked<RedisStorageAdapter>;

  const createMockSession = (id: string): Session => ({
    id,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    expiresAt: new Date(Date.now() + 900000),
    status: 'active',
    conversationHistory: [],
  });

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    mockInMemoryAdapter = {
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      has: jest.fn(),
      keys: jest.fn(),
      clear: jest.fn(),
      count: jest.fn(),
      isHealthy: jest.fn(),
      getType: jest.fn().mockReturnValue('in-memory'),
    } as unknown as jest.Mocked<InMemoryStorageAdapter>;

    mockRedisAdapter = {
      connect: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      has: jest.fn(),
      keys: jest.fn(),
      clear: jest.fn(),
      count: jest.fn(),
      isHealthy: jest.fn(),
      getType: jest.fn().mockReturnValue('redis'),
      getLatency: jest.fn(),
    } as unknown as jest.Mocked<RedisStorageAdapter>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: InMemoryStorageAdapter, useValue: mockInMemoryAdapter },
        { provide: RedisStorageAdapter, useValue: mockRedisAdapter },
      ],
    }).compile();

    service = module.get<StorageService>(StorageService);
  });

  describe('initialization', () => {
    it('should use in-memory adapter when Redis is disabled', async () => {
      mockConfigService.get.mockReturnValue(false);

      await service.initializeStorage();

      expect(service.getType()).toBe('in-memory');
      expect(service.isUsingFallback()).toBe(false);
      expect(service.isUsingRedis()).toBe(false);
    });

    it('should use Redis adapter when Redis is enabled and connection succeeds', async () => {
      mockConfigService.get.mockReturnValue(true);
      mockRedisAdapter.connect.mockResolvedValue(true);

      await service.initializeStorage();

      expect(service.getType()).toBe('redis');
      expect(service.isUsingFallback()).toBe(false);
      expect(service.isUsingRedis()).toBe(true);
    });

    it('should fall back to in-memory when Redis connection fails', async () => {
      mockConfigService.get.mockReturnValue(true);
      mockRedisAdapter.connect.mockResolvedValue(false);

      await service.initializeStorage();

      expect(service.getType()).toBe('in-memory');
      expect(service.isUsingFallback()).toBe(true);
      expect(service.isUsingRedis()).toBe(false);
    });
  });

  describe('get', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue(false);
      await service.initializeStorage();
    });

    it('should delegate to active adapter', async () => {
      const session = createMockSession('test-1');
      mockInMemoryAdapter.get.mockResolvedValue(session);

      const result = await service.get('test-1');

      expect(result).toEqual(session);
      expect(mockInMemoryAdapter.get).toHaveBeenCalledWith('test-1');
    });

    it('should return null when session not found', async () => {
      mockInMemoryAdapter.get.mockResolvedValue(null);

      const result = await service.get('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue(false);
      await service.initializeStorage();
    });

    it('should delegate to active adapter', async () => {
      const session = createMockSession('test-1');
      mockInMemoryAdapter.set.mockResolvedValue(undefined);

      await service.set('test-1', session, 60000);

      expect(mockInMemoryAdapter.set).toHaveBeenCalledWith(
        'test-1',
        session,
        60000,
      );
    });
  });

  describe('delete', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue(false);
      await service.initializeStorage();
    });

    it('should delegate to active adapter', async () => {
      mockInMemoryAdapter.delete.mockResolvedValue(true);

      const result = await service.delete('test-1');

      expect(result).toBe(true);
      expect(mockInMemoryAdapter.delete).toHaveBeenCalledWith('test-1');
    });
  });

  describe('has', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue(false);
      await service.initializeStorage();
    });

    it('should delegate to active adapter', async () => {
      mockInMemoryAdapter.has.mockResolvedValue(true);

      const result = await service.has('test-1');

      expect(result).toBe(true);
      expect(mockInMemoryAdapter.has).toHaveBeenCalledWith('test-1');
    });
  });

  describe('keys', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue(false);
      await service.initializeStorage();
    });

    it('should delegate to active adapter', async () => {
      mockInMemoryAdapter.keys.mockResolvedValue(['key1', 'key2']);

      const result = await service.keys();

      expect(result).toEqual(['key1', 'key2']);
    });
  });

  describe('clear', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue(false);
      await service.initializeStorage();
    });

    it('should delegate to active adapter', async () => {
      mockInMemoryAdapter.clear.mockResolvedValue(undefined);

      await service.clear();

      expect(mockInMemoryAdapter.clear).toHaveBeenCalled();
    });
  });

  describe('count', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue(false);
      await service.initializeStorage();
    });

    it('should delegate to active adapter', async () => {
      mockInMemoryAdapter.count.mockResolvedValue(5);

      const result = await service.count();

      expect(result).toBe(5);
    });
  });

  describe('isHealthy', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue(false);
      await service.initializeStorage();
    });

    it('should delegate to active adapter', async () => {
      mockInMemoryAdapter.isHealthy.mockResolvedValue(true);

      const result = await service.isHealthy();

      expect(result).toBe(true);
    });
  });

  describe('Redis fallback behavior', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue(true);
      mockRedisAdapter.connect.mockResolvedValue(true);
      await service.initializeStorage();
    });

    it('should fall back to in-memory on Redis get error', async () => {
      mockRedisAdapter.get.mockRejectedValue(new Error('Redis error'));
      mockInMemoryAdapter.get.mockResolvedValue(null);

      const result = await service.get('test-1');

      expect(result).toBeNull();
      expect(service.isUsingFallback()).toBe(true);
      expect(service.getType()).toBe('in-memory');
    });

    it('should fall back to in-memory on Redis set error', async () => {
      mockRedisAdapter.set.mockRejectedValue(new Error('Redis error'));
      mockInMemoryAdapter.set.mockResolvedValue(undefined);

      await service.set('test-1', createMockSession('test-1'));

      expect(service.isUsingFallback()).toBe(true);
    });

    it('should fall back to in-memory on Redis delete error', async () => {
      mockRedisAdapter.delete.mockRejectedValue(new Error('Redis error'));
      mockInMemoryAdapter.delete.mockResolvedValue(true);

      await service.delete('test-1');

      expect(service.isUsingFallback()).toBe(true);
    });

    it('should fall back to in-memory on Redis has error', async () => {
      mockRedisAdapter.has.mockRejectedValue(new Error('Redis error'));
      mockInMemoryAdapter.has.mockResolvedValue(false);

      await service.has('test-1');

      expect(service.isUsingFallback()).toBe(true);
    });

    it('should fall back to in-memory on Redis keys error', async () => {
      mockRedisAdapter.keys.mockRejectedValue(new Error('Redis error'));
      mockInMemoryAdapter.keys.mockResolvedValue([]);

      await service.keys();

      expect(service.isUsingFallback()).toBe(true);
    });

    it('should fall back to in-memory on Redis clear error', async () => {
      mockRedisAdapter.clear.mockRejectedValue(new Error('Redis error'));
      mockInMemoryAdapter.clear.mockResolvedValue(undefined);

      await service.clear();

      expect(service.isUsingFallback()).toBe(true);
    });

    it('should fall back to in-memory on Redis count error', async () => {
      mockRedisAdapter.count.mockRejectedValue(new Error('Redis error'));
      mockInMemoryAdapter.count.mockResolvedValue(0);

      await service.count();

      expect(service.isUsingFallback()).toBe(true);
    });
  });

  describe('getRedisLatency', () => {
    it('should return latency when using Redis', async () => {
      mockConfigService.get.mockReturnValue(true);
      mockRedisAdapter.connect.mockResolvedValue(true);
      mockRedisAdapter.getLatency.mockResolvedValue(5);

      await service.initializeStorage();
      const result = await service.getRedisLatency();

      expect(result).toBe(5);
    });

    it('should return null when using in-memory', async () => {
      mockConfigService.get.mockReturnValue(false);
      await service.initializeStorage();

      const result = await service.getRedisLatency();

      expect(result).toBeNull();
    });
  });

  describe('attemptRedisReconnection', () => {
    it('should return true if already using Redis', async () => {
      mockConfigService.get.mockReturnValue(true);
      mockRedisAdapter.connect.mockResolvedValue(true);
      await service.initializeStorage();

      const result = await service.attemptRedisReconnection();

      expect(result).toBe(true);
    });

    it('should reconnect to Redis if using fallback', async () => {
      mockConfigService.get.mockReturnValue(true);
      mockRedisAdapter.connect.mockResolvedValueOnce(false);
      await service.initializeStorage();

      expect(service.isUsingFallback()).toBe(true);

      mockRedisAdapter.connect.mockResolvedValueOnce(true);
      const result = await service.attemptRedisReconnection();

      expect(result).toBe(true);
      expect(service.isUsingFallback()).toBe(false);
      expect(service.isUsingRedis()).toBe(true);
    });

    it('should return false if reconnection fails', async () => {
      mockConfigService.get.mockReturnValue(true);
      mockRedisAdapter.connect.mockResolvedValue(false);
      await service.initializeStorage();

      const result = await service.attemptRedisReconnection();

      expect(result).toBe(false);
      expect(service.isUsingFallback()).toBe(true);
    });
  });

  describe('error propagation for in-memory adapter', () => {
    beforeEach(async () => {
      mockConfigService.get.mockReturnValue(false);
      await service.initializeStorage();
    });

    it('should propagate errors from in-memory adapter', async () => {
      mockInMemoryAdapter.get.mockRejectedValue(new Error('In-memory error'));

      await expect(service.get('test-1')).rejects.toThrow('In-memory error');
    });
  });
});
