import { Test, TestingModule } from '@nestjs/testing';
import { RedisStorageAdapter } from './redis-storage.adapter';
import { RedisPoolService } from '@/redis/redis-pool.service';
import { Session } from '@/session/interfaces/session.interface';

describe('RedisStorageAdapter', () => {
  let adapter: RedisStorageAdapter;
  let mockRedisClient: any;
  let mockRedisPoolService: any;

  const createMockSession = (id: string): Session => ({
    id,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    lastActivityAt: new Date('2024-01-01T00:00:00Z'),
    expiresAt: new Date('2024-01-01T01:00:00Z'),
    status: 'active',
    conversationHistory: [],
  });

  beforeEach(async () => {
    // Create mock Redis client
    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      keys: jest.fn(),
      ping: jest.fn(),
    };

    // Create mock RedisPoolService
    mockRedisPoolService = {
      isEnabled: jest.fn().mockReturnValue(true),
      isAvailable: jest.fn().mockReturnValue(true),
      getClient: jest.fn().mockReturnValue(mockRedisClient),
      getKeyPrefix: jest.fn().mockReturnValue('talksy:'),
      isHealthy: jest.fn().mockResolvedValue(true),
      getLatency: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisStorageAdapter,
        { provide: RedisPoolService, useValue: mockRedisPoolService },
      ],
    }).compile();

    adapter = module.get<RedisStorageAdapter>(RedisStorageAdapter);
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  describe('connect', () => {
    it('should return true when Redis pool is available', async () => {
      mockRedisPoolService.isAvailable.mockReturnValue(true);
      const result = await adapter.connect();
      expect(result).toBe(true);
    });

    it('should return false when Redis pool is not available', async () => {
      mockRedisPoolService.isAvailable.mockReturnValue(false);
      const result = await adapter.connect();
      expect(result).toBe(false);
    });
  });

  describe('operations when connected', () => {
    describe('get', () => {
      it('should return null when key does not exist', async () => {
        mockRedisClient.get.mockResolvedValue(null);
        const result = await adapter.get('non-existent');
        expect(result).toBeNull();
      });

      it('should return deserialized session when key exists', async () => {
        const session = createMockSession('test-1');
        const serialized = JSON.stringify({
          ...session,
          createdAt: session.createdAt.toISOString(),
          lastActivityAt: session.lastActivityAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
        });

        mockRedisClient.get.mockResolvedValue(serialized);
        const result = await adapter.get('test-1');

        expect(result).toBeDefined();
        expect(result?.id).toBe('test-1');
        expect(result?.status).toBe('active');
        expect(result?.createdAt).toBeInstanceOf(Date);
      });

      it('should throw and log error on Redis error', async () => {
        mockRedisClient.get.mockRejectedValue(new Error('Redis error'));

        await expect(adapter.get('test-1')).rejects.toThrow('Redis error');
      });
    });

    describe('set', () => {
      it('should set session without TTL', async () => {
        mockRedisClient.set.mockResolvedValue('OK');
        const session = createMockSession('test-1');

        await adapter.set('test-1', session);

        expect(mockRedisClient.set).toHaveBeenCalledWith(
          'talksy:session:test-1',
          expect.any(String),
        );
      });

      it('should set session with TTL', async () => {
        mockRedisClient.set.mockResolvedValue('OK');
        const session = createMockSession('test-1');

        await adapter.set('test-1', session, 60000);

        expect(mockRedisClient.set).toHaveBeenCalledWith(
          'talksy:session:test-1',
          expect.any(String),
          'PX',
          60000,
        );
      });

      it('should throw and log error on Redis error', async () => {
        mockRedisClient.set.mockRejectedValue(new Error('Redis error'));

        await expect(
          adapter.set('test-1', createMockSession('test-1')),
        ).rejects.toThrow('Redis error');
      });
    });

    describe('delete', () => {
      it('should return true when key is deleted', async () => {
        mockRedisClient.del.mockResolvedValue(1);
        const result = await adapter.delete('test-1');
        expect(result).toBe(true);
      });

      it('should return false when key does not exist', async () => {
        mockRedisClient.del.mockResolvedValue(0);
        const result = await adapter.delete('non-existent');
        expect(result).toBe(false);
      });

      it('should throw and log error on Redis error', async () => {
        mockRedisClient.del.mockRejectedValue(new Error('Redis error'));

        await expect(adapter.delete('test-1')).rejects.toThrow('Redis error');
      });
    });

    describe('has', () => {
      it('should return true when key exists', async () => {
        mockRedisClient.exists.mockResolvedValue(1);
        const result = await adapter.has('test-1');
        expect(result).toBe(true);
      });

      it('should return false when key does not exist', async () => {
        mockRedisClient.exists.mockResolvedValue(0);
        const result = await adapter.has('non-existent');
        expect(result).toBe(false);
      });

      it('should throw and log error on Redis error', async () => {
        mockRedisClient.exists.mockRejectedValue(new Error('Redis error'));

        await expect(adapter.has('test-1')).rejects.toThrow('Redis error');
      });
    });

    describe('keys', () => {
      it('should return empty array when no keys', async () => {
        mockRedisClient.keys.mockResolvedValue([]);
        const result = await adapter.keys();
        expect(result).toEqual([]);
      });

      it('should return keys without prefix', async () => {
        mockRedisClient.keys.mockResolvedValue([
          'talksy:session:key1',
          'talksy:session:key2',
        ]);
        const result = await adapter.keys();
        expect(result).toEqual(['key1', 'key2']);
      });

      it('should throw and log error on Redis error', async () => {
        mockRedisClient.keys.mockRejectedValue(new Error('Redis error'));

        await expect(adapter.keys()).rejects.toThrow('Redis error');
      });
    });

    describe('clear', () => {
      it('should clear all session keys', async () => {
        mockRedisClient.keys.mockResolvedValue([
          'talksy:session:key1',
          'talksy:session:key2',
        ]);
        mockRedisClient.del.mockResolvedValue(2);

        await adapter.clear();

        expect(mockRedisClient.del).toHaveBeenCalledWith(
          'talksy:session:key1',
          'talksy:session:key2',
        );
      });

      it('should handle empty keys gracefully', async () => {
        mockRedisClient.keys.mockResolvedValue([]);

        await adapter.clear();

        expect(mockRedisClient.del).not.toHaveBeenCalled();
      });

      it('should throw and log error on Redis error', async () => {
        mockRedisClient.keys.mockRejectedValue(new Error('Redis error'));

        await expect(adapter.clear()).rejects.toThrow('Redis error');
      });
    });

    describe('count', () => {
      it('should return count of session keys', async () => {
        mockRedisClient.keys.mockResolvedValue([
          'talksy:session:key1',
          'talksy:session:key2',
          'talksy:session:key3',
        ]);

        const result = await adapter.count();
        expect(result).toBe(3);
      });

      it('should return 0 when no keys', async () => {
        mockRedisClient.keys.mockResolvedValue([]);
        const result = await adapter.count();
        expect(result).toBe(0);
      });

      it('should throw and log error on Redis error', async () => {
        mockRedisClient.keys.mockRejectedValue(new Error('Redis error'));

        await expect(adapter.count()).rejects.toThrow('Redis error');
      });
    });

    describe('isHealthy', () => {
      it('should delegate to RedisPoolService.isHealthy', async () => {
        mockRedisPoolService.isHealthy.mockResolvedValue(true);
        const result = await adapter.isHealthy();
        expect(result).toBe(true);
        expect(mockRedisPoolService.isHealthy).toHaveBeenCalled();
      });

      it('should return false when pool reports unhealthy', async () => {
        mockRedisPoolService.isHealthy.mockResolvedValue(false);
        const result = await adapter.isHealthy();
        expect(result).toBe(false);
      });
    });

    describe('getLatency', () => {
      it('should delegate to RedisPoolService.getLatency', async () => {
        mockRedisPoolService.getLatency.mockResolvedValue(5);
        const result = await adapter.getLatency();
        expect(result).toBe(5);
        expect(mockRedisPoolService.getLatency).toHaveBeenCalled();
      });

      it('should return null when pool returns null', async () => {
        mockRedisPoolService.getLatency.mockResolvedValue(null);
        const result = await adapter.getLatency();
        expect(result).toBeNull();
      });
    });

    describe('serialization', () => {
      it('should correctly serialize and deserialize session with disconnectedAt', async () => {
        const session: Session = {
          ...createMockSession('test-1'),
          status: 'disconnected',
          disconnectedAt: new Date('2024-01-01T00:30:00Z'),
        };

        const serialized = JSON.stringify({
          ...session,
          createdAt: session.createdAt.toISOString(),
          lastActivityAt: session.lastActivityAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
          disconnectedAt: session.disconnectedAt?.toISOString(),
        });

        mockRedisClient.get.mockResolvedValue(serialized);
        const result = await adapter.get('test-1');

        expect(result?.disconnectedAt).toBeInstanceOf(Date);
        expect(result?.disconnectedAt?.toISOString()).toBe(
          '2024-01-01T00:30:00.000Z',
        );
      });
    });
  });

  describe('operations when not connected', () => {
    beforeEach(() => {
      mockRedisPoolService.getClient.mockReturnValue(null);
    });

    it('get should throw error when not connected', async () => {
      await expect(adapter.get('test')).rejects.toThrow('Redis not connected');
    });

    it('set should throw error when not connected', async () => {
      await expect(
        adapter.set('test', createMockSession('test')),
      ).rejects.toThrow('Redis not connected');
    });

    it('delete should throw error when not connected', async () => {
      await expect(adapter.delete('test')).rejects.toThrow(
        'Redis not connected',
      );
    });

    it('has should throw error when not connected', async () => {
      await expect(adapter.has('test')).rejects.toThrow('Redis not connected');
    });

    it('keys should throw error when not connected', async () => {
      await expect(adapter.keys()).rejects.toThrow('Redis not connected');
    });

    it('clear should throw error when not connected', async () => {
      await expect(adapter.clear()).rejects.toThrow('Redis not connected');
    });

    it('count should throw error when not connected', async () => {
      await expect(adapter.count()).rejects.toThrow('Redis not connected');
    });
  });

  describe('getType', () => {
    it('should return redis', () => {
      expect(adapter.getType()).toBe('redis');
    });
  });

  describe('isConnectedStatus', () => {
    it('should delegate to RedisPoolService.isAvailable', () => {
      mockRedisPoolService.isAvailable.mockReturnValue(true);
      expect(adapter.isConnectedStatus()).toBe(true);

      mockRedisPoolService.isAvailable.mockReturnValue(false);
      expect(adapter.isConnectedStatus()).toBe(false);
    });
  });
});
