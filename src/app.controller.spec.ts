import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthCheckDto } from './common/dto/health-check.dto';

describe('AppController', () => {
  let controller: AppController;
  let service: AppService;

  const mockAppService = {
    getHealth: jest.fn(),
    getDetailedHealth: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: mockAppService }],
    }).compile();

    controller = module.get<AppController>(AppController);
    service = module.get<AppService>(AppService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getHealth', () => {
    it('should return health status from service', () => {
      const mockHealth = {
        status: 'ok',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      mockAppService.getHealth.mockReturnValue(mockHealth);

      const result = controller.getHealth();

      expect(result).toEqual(mockHealth);
      expect(service.getHealth).toHaveBeenCalled();
    });
  });

  describe('getDetailedHealth', () => {
    it('should return detailed health status from service', async () => {
      const mockDetailedHealth: HealthCheckDto = {
        status: 'healthy',
        timestamp: '2024-01-01T00:00:00.000Z',
        version: '0.0.1',
        environment: 'test',
        uptime: 100,
        checks: {
          memory: {
            status: 'healthy',
            heapUsed: 50000000,
            heapTotal: 100000000,
            rss: 150000000,
            percentage: 0.5,
          },
          redis: {
            status: 'healthy',
            latencyMs: 5,
            usingFallback: false,
          },
          sessions: {
            active: 5,
            total: 7,
          },
        },
      };

      mockAppService.getDetailedHealth.mockResolvedValue(mockDetailedHealth);

      const result = await controller.getDetailedHealth();

      expect(result).toEqual(mockDetailedHealth);
      expect(service.getDetailedHealth).toHaveBeenCalled();
    });

    it('should handle degraded status', async () => {
      const mockDetailedHealth: HealthCheckDto = {
        status: 'degraded',
        timestamp: '2024-01-01T00:00:00.000Z',
        version: '0.0.1',
        environment: 'test',
        uptime: 100,
        checks: {
          memory: {
            status: 'healthy',
            heapUsed: 50000000,
            heapTotal: 100000000,
            rss: 150000000,
            percentage: 0.5,
          },
          redis: {
            status: 'degraded',
            usingFallback: true,
            message: 'Using in-memory fallback',
          },
          sessions: {
            active: 0,
            total: 0,
          },
        },
      };

      mockAppService.getDetailedHealth.mockResolvedValue(mockDetailedHealth);

      const result = await controller.getDetailedHealth();

      expect(result.status).toBe('degraded');
      expect(result.checks.redis.usingFallback).toBe(true);
    });
  });
});
