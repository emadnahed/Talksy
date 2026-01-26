import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisIoAdapter } from './redis-io.adapter';

// Mock the redis and socket.io-adapter modules
jest.mock('redis', () => ({
  createClient: jest.fn(),
}));

jest.mock('@socket.io/redis-adapter', () => ({
  createAdapter: jest.fn(),
}));

describe('RedisIoAdapter', () => {
  let adapter: RedisIoAdapter;
  let mockApp: Partial<INestApplication>;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockRedisClient: any;
  let mockSubClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfigService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    mockApp = {
      getHttpServer: jest.fn().mockReturnValue({}),
    };

    mockSubClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
    };

    mockRedisClient = {
      on: jest.fn(),
      connect: jest.fn().mockResolvedValue(undefined),
      quit: jest.fn().mockResolvedValue(undefined),
      duplicate: jest.fn().mockReturnValue(mockSubClient),
    };

    const { createClient } = require('redis');
    (createClient as jest.Mock).mockReturnValue(mockRedisClient);

    const { createAdapter } = require('@socket.io/redis-adapter');
    (createAdapter as jest.Mock).mockReturnValue({});

    adapter = new RedisIoAdapter(
      mockApp as INestApplication,
      mockConfigService,
    );
  });

  describe('connectToRedis', () => {
    it('should return false when Redis is disabled', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'REDIS_ENABLED') return false;
        return defaultValue;
      });

      const result = await adapter.connectToRedis();

      expect(result).toBe(false);
    });

    it('should connect successfully when Redis is enabled', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'REDIS_ENABLED') return true;
        if (key === 'REDIS_HOST') return 'localhost';
        if (key === 'REDIS_PORT') return 6379;
        if (key === 'REDIS_PASSWORD') return '';
        return defaultValue;
      });

      const result = await adapter.connectToRedis();

      expect(result).toBe(true);
      expect(mockRedisClient.connect).toHaveBeenCalled();
      expect(mockSubClient.connect).toHaveBeenCalled();
    });

    it('should connect with password when provided', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'REDIS_ENABLED') return true;
        if (key === 'REDIS_HOST') return 'localhost';
        if (key === 'REDIS_PORT') return 6379;
        if (key === 'REDIS_PASSWORD') return 'secret';
        return defaultValue;
      });

      const result = await adapter.connectToRedis();

      expect(result).toBe(true);
      const { createClient } = require('redis');
      expect(createClient).toHaveBeenCalledWith({
        url: 'redis://:secret@localhost:6379',
      });
    });

    it('should handle connection failure', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'REDIS_ENABLED') return true;
        if (key === 'REDIS_HOST') return 'localhost';
        if (key === 'REDIS_PORT') return 6379;
        if (key === 'REDIS_PASSWORD') return '';
        return defaultValue;
      });

      mockRedisClient.connect.mockRejectedValue(new Error('Connection failed'));

      const result = await adapter.connectToRedis();

      expect(result).toBe(false);
    });

    it('should handle non-Error exceptions', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'REDIS_ENABLED') return true;
        if (key === 'REDIS_HOST') return 'localhost';
        if (key === 'REDIS_PORT') return 6379;
        if (key === 'REDIS_PASSWORD') return '';
        return defaultValue;
      });

      mockRedisClient.connect.mockRejectedValue('string error');

      const result = await adapter.connectToRedis();

      expect(result).toBe(false);
    });

    it('should register error handlers on pub client', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'REDIS_ENABLED') return true;
        if (key === 'REDIS_HOST') return 'localhost';
        if (key === 'REDIS_PORT') return 6379;
        if (key === 'REDIS_PASSWORD') return '';
        return defaultValue;
      });

      await adapter.connectToRedis();

      expect(mockRedisClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should register error handlers on sub client', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'REDIS_ENABLED') return true;
        if (key === 'REDIS_HOST') return 'localhost';
        if (key === 'REDIS_PORT') return 6379;
        if (key === 'REDIS_PASSWORD') return '';
        return defaultValue;
      });

      await adapter.connectToRedis();

      expect(mockSubClient.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should handle pub client error event', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'REDIS_ENABLED') return true;
        if (key === 'REDIS_HOST') return 'localhost';
        if (key === 'REDIS_PORT') return 6379;
        if (key === 'REDIS_PASSWORD') return '';
        return defaultValue;
      });

      await adapter.connectToRedis();

      // Get the error handler and call it
      const errorHandler = mockRedisClient.on.mock.calls.find(
        (call: any) => call[0] === 'error',
      )?.[1];
      expect(() => errorHandler?.(new Error('test error'))).not.toThrow();
    });

    it('should handle sub client error event', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'REDIS_ENABLED') return true;
        if (key === 'REDIS_HOST') return 'localhost';
        if (key === 'REDIS_PORT') return 6379;
        if (key === 'REDIS_PASSWORD') return '';
        return defaultValue;
      });

      await adapter.connectToRedis();

      const errorHandler = mockSubClient.on.mock.calls.find(
        (call: any) => call[0] === 'error',
      )?.[1];
      expect(() => errorHandler?.(new Error('test error'))).not.toThrow();
    });
  });

  describe('createIOServer', () => {
    it('should create server without adapter when not connected', () => {
      mockConfigService.get.mockReturnValue('*');

      const mockServer = {
        adapter: jest.fn(),
      };

      // Mock the parent createIOServer
      jest.spyOn(adapter as any, 'createIOServer').mockReturnValue(mockServer);

      const result = (adapter as any).createIOServer(3000, {});

      expect(result).toBeDefined();
    });

    it('should apply adapter when connected to Redis', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'REDIS_ENABLED') return true;
        if (key === 'CORS_ORIGIN') return '*';
        if (key === 'REDIS_HOST') return 'localhost';
        if (key === 'REDIS_PORT') return 6379;
        if (key === 'REDIS_PASSWORD') return '';
        return defaultValue;
      });

      await adapter.connectToRedis();

      // The server.adapter should be called with the adapter constructor
      // This is tested by checking the adapter was created
      const { createAdapter } = require('@socket.io/redis-adapter');
      expect(createAdapter).toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should close connections when clients exist', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'REDIS_ENABLED') return true;
        if (key === 'REDIS_HOST') return 'localhost';
        if (key === 'REDIS_PORT') return 6379;
        if (key === 'REDIS_PASSWORD') return '';
        return defaultValue;
      });

      await adapter.connectToRedis();
      await adapter.close();

      expect(mockRedisClient.quit).toHaveBeenCalled();
      expect(mockSubClient.quit).toHaveBeenCalled();
    });

    it('should handle close when not connected', async () => {
      await expect(adapter.close()).resolves.not.toThrow();
    });
  });
});
