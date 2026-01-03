import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppService } from './app.service';
import { StorageService } from './storage/storage.service';
import { SessionService } from './session/session.service';

describe('AppService', () => {
  let service: AppService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockStorageService: jest.Mocked<StorageService>;
  let mockSessionService: jest.Mocked<SessionService>;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: unknown) => defaultValue),
    } as unknown as jest.Mocked<ConfigService>;

    mockStorageService = {
      isUsingFallback: jest.fn().mockReturnValue(false),
      isUsingRedis: jest.fn().mockReturnValue(false),
      isHealthy: jest.fn().mockResolvedValue(true),
      getRedisLatency: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<StorageService>;

    mockSessionService = {
      getActiveSessionCount: jest.fn().mockReturnValue(5),
      getDisconnectedSessionCount: jest.fn().mockReturnValue(2),
    } as unknown as jest.Mocked<SessionService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: StorageService, useValue: mockStorageService },
        { provide: SessionService, useValue: mockSessionService },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getHealth', () => {
    it('should return health status with ok and timestamp', () => {
      const result = service.getHealth();

      expect(result).toHaveProperty('status', 'ok');
      expect(result).toHaveProperty('timestamp');
      expect(typeof result.timestamp).toBe('string');
    });

    it('should return a valid ISO timestamp', () => {
      const result = service.getHealth();
      const parsedDate = new Date(result.timestamp);

      expect(parsedDate.toISOString()).toBe(result.timestamp);
    });
  });

  describe('getDetailedHealth', () => {
    it('should return comprehensive health status', async () => {
      const result = await service.getDetailedHealth();

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('environment');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('checks');
      expect(result.checks).toHaveProperty('memory');
      expect(result.checks).toHaveProperty('redis');
      expect(result.checks).toHaveProperty('sessions');
    });

    it('should return valid ISO timestamp', async () => {
      const result = await service.getDetailedHealth();
      const parsedDate = new Date(result.timestamp);

      expect(parsedDate.toISOString()).toBe(result.timestamp);
    });

    it('should return uptime in seconds', async () => {
      const result = await service.getDetailedHealth();

      expect(typeof result.uptime).toBe('number');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    describe('memory check', () => {
      it('should return memory metrics', async () => {
        const result = await service.getDetailedHealth();

        expect(result.checks.memory).toHaveProperty('status');
        expect(result.checks.memory).toHaveProperty('heapUsed');
        expect(result.checks.memory).toHaveProperty('heapTotal');
        expect(result.checks.memory).toHaveProperty('rss');
        expect(result.checks.memory).toHaveProperty('percentage');
      });

      it('should report healthy status for normal memory usage', async () => {
        const originalMemoryUsage = process.memoryUsage;
        (process as unknown as { memoryUsage: () => NodeJS.MemoryUsage }).memoryUsage = () => ({
          heapUsed: 50000000, // 50MB
          heapTotal: 100000000, // 100MB (50% usage)
          rss: 150000000,
          external: 0,
          arrayBuffers: 0,
        });

        const result = await service.getDetailedHealth();

        expect(result.checks.memory.status).toBe('healthy');
        process.memoryUsage = originalMemoryUsage;
      });

      it('should report degraded status for high memory usage', async () => {
        const originalMemoryUsage = process.memoryUsage;
        (process as unknown as { memoryUsage: () => NodeJS.MemoryUsage }).memoryUsage = () => ({
          heapUsed: 85000000, // 85MB
          heapTotal: 100000000, // 100MB (85% usage)
          rss: 150000000,
          external: 0,
          arrayBuffers: 0,
        });

        const result = await service.getDetailedHealth();

        expect(result.checks.memory.status).toBe('degraded');
        process.memoryUsage = originalMemoryUsage;
      });

      it('should report unhealthy status for critical memory usage', async () => {
        const originalMemoryUsage = process.memoryUsage;
        (process as unknown as { memoryUsage: () => NodeJS.MemoryUsage }).memoryUsage = () => ({
          heapUsed: 96000000, // 96MB
          heapTotal: 100000000, // 100MB (96% usage)
          rss: 150000000,
          external: 0,
          arrayBuffers: 0,
        });

        const result = await service.getDetailedHealth();

        expect(result.checks.memory.status).toBe('unhealthy');
        process.memoryUsage = originalMemoryUsage;
      });
    });

    describe('redis check', () => {
      it('should report healthy when not using Redis (default in-memory)', async () => {
        mockStorageService.isUsingRedis.mockReturnValue(false);
        mockStorageService.isUsingFallback.mockReturnValue(false);

        const result = await service.getDetailedHealth();

        expect(result.checks.redis.status).toBe('healthy');
        expect(result.checks.redis.usingFallback).toBe(false);
        expect(result.checks.redis.message).toContain('in-memory storage');
      });

      it('should report degraded when using fallback', async () => {
        mockStorageService.isUsingRedis.mockReturnValue(false);
        mockStorageService.isUsingFallback.mockReturnValue(true);

        const result = await service.getDetailedHealth();

        expect(result.checks.redis.status).toBe('degraded');
        expect(result.checks.redis.usingFallback).toBe(true);
        expect(result.checks.redis.message).toContain('fallback');
      });

      it('should report healthy when Redis is connected and healthy', async () => {
        mockStorageService.isUsingRedis.mockReturnValue(true);
        mockStorageService.isHealthy.mockResolvedValue(true);
        mockStorageService.getRedisLatency.mockResolvedValue(5);

        const result = await service.getDetailedHealth();

        expect(result.checks.redis.status).toBe('healthy');
        expect(result.checks.redis.latencyMs).toBe(5);
        expect(result.checks.redis.usingFallback).toBe(false);
      });

      it('should report unhealthy when Redis health check fails', async () => {
        mockStorageService.isUsingRedis.mockReturnValue(true);
        mockStorageService.isHealthy.mockResolvedValue(false);

        const result = await service.getDetailedHealth();

        expect(result.checks.redis.status).toBe('unhealthy');
        expect(result.checks.redis.message).toContain('health check failed');
      });

      it('should report unhealthy when Redis health check throws', async () => {
        mockStorageService.isUsingRedis.mockReturnValue(true);
        mockStorageService.isHealthy.mockRejectedValue(new Error('Connection error'));

        const result = await service.getDetailedHealth();

        expect(result.checks.redis.status).toBe('unhealthy');
        expect(result.checks.redis.message).toContain('error');
      });
    });

    describe('sessions check', () => {
      it('should return session counts', async () => {
        const result = await service.getDetailedHealth();

        expect(result.checks.sessions.active).toBe(5);
        expect(result.checks.sessions.total).toBe(7); // 5 active + 2 disconnected
      });
    });

    describe('overall status determination', () => {
      it('should return healthy when all checks are healthy', async () => {
        const originalMemoryUsage = process.memoryUsage;
        (process as unknown as { memoryUsage: () => NodeJS.MemoryUsage }).memoryUsage = () => ({
          heapUsed: 50000000, // 50MB
          heapTotal: 100000000, // 100MB (50% usage - healthy)
          rss: 150000000,
          external: 0,
          arrayBuffers: 0,
        });

        mockStorageService.isUsingRedis.mockReturnValue(true);
        mockStorageService.isHealthy.mockResolvedValue(true);

        const result = await service.getDetailedHealth();

        expect(result.status).toBe('healthy');
        process.memoryUsage = originalMemoryUsage;
      });

      it('should return degraded when redis is degraded', async () => {
        mockStorageService.isUsingRedis.mockReturnValue(false);
        mockStorageService.isUsingFallback.mockReturnValue(true);

        const result = await service.getDetailedHealth();

        expect(result.status).toBe('degraded');
      });

      it('should return unhealthy when redis is unhealthy', async () => {
        mockStorageService.isUsingRedis.mockReturnValue(true);
        mockStorageService.isHealthy.mockResolvedValue(false);

        const result = await service.getDetailedHealth();

        expect(result.status).toBe('unhealthy');
      });
    });
  });
});
