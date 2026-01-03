import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthCheckDto,
  HealthStatus,
  MemoryCheck,
  RedisCheck,
  SessionsCheck,
} from './common/dto/health-check.dto';
import { StorageService } from './storage/storage.service';
import { SessionService } from './session/session.service';

// Memory thresholds for health status
const MEMORY_WARNING_THRESHOLD = 0.8; // 80%
const MEMORY_CRITICAL_THRESHOLD = 0.95; // 95%

@Injectable()
export class AppService {
  private readonly startTime = Date.now();

  constructor(
    private readonly configService: ConfigService,
    private readonly storageService: StorageService,
    private readonly sessionService: SessionService,
  ) {}

  /**
   * Simple health check for backwards compatibility
   */
  getHealth(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Enhanced health check with detailed status
   */
  async getDetailedHealth(): Promise<HealthCheckDto> {
    const memoryCheck = this.checkMemory();
    const redisCheck = await this.checkRedis();
    const sessionsCheck = this.checkSessions();

    const overallStatus = this.determineOverallStatus(memoryCheck, redisCheck);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: this.getVersion(),
      environment: this.configService.get<string>('NODE_ENV', 'development'),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      checks: {
        memory: memoryCheck,
        redis: redisCheck,
        sessions: sessionsCheck,
      },
    };
  }

  private checkMemory(): MemoryCheck {
    const memoryUsage = process.memoryUsage();
    const heapUsed = memoryUsage.heapUsed;
    const heapTotal = memoryUsage.heapTotal;
    const rss = memoryUsage.rss;
    const percentage = heapTotal > 0 ? heapUsed / heapTotal : 0;

    let status: HealthStatus = 'healthy';
    if (percentage >= MEMORY_CRITICAL_THRESHOLD) {
      status = 'unhealthy';
    } else if (percentage >= MEMORY_WARNING_THRESHOLD) {
      status = 'degraded';
    }

    return {
      status,
      heapUsed,
      heapTotal,
      rss,
      percentage: Math.round(percentage * 100) / 100,
    };
  }

  private async checkRedis(): Promise<RedisCheck> {
    const usingFallback = this.storageService.isUsingFallback();
    const isUsingRedis = this.storageService.isUsingRedis();

    if (!isUsingRedis) {
      return {
        status: usingFallback ? 'degraded' : 'healthy',
        usingFallback,
        message: usingFallback
          ? 'Using in-memory fallback (Redis connection failed)'
          : 'Redis not enabled, using in-memory storage',
      };
    }

    try {
      const isHealthy = await this.storageService.isHealthy();
      const latencyMs = await this.storageService.getRedisLatency();

      if (!isHealthy) {
        return {
          status: 'unhealthy',
          usingFallback: false,
          message: 'Redis health check failed',
        };
      }

      return {
        status: 'healthy',
        latencyMs: latencyMs ?? undefined,
        usingFallback: false,
      };
    } catch {
      return {
        status: 'unhealthy',
        usingFallback: false,
        message: 'Redis health check error',
      };
    }
  }

  private checkSessions(): SessionsCheck {
    return {
      active: this.sessionService.getActiveSessionCount(),
      total:
        this.sessionService.getActiveSessionCount() +
        this.sessionService.getDisconnectedSessionCount(),
    };
  }

  private determineOverallStatus(
    memory: MemoryCheck,
    redis: RedisCheck,
  ): HealthStatus {
    if (memory.status === 'unhealthy' || redis.status === 'unhealthy') {
      return 'unhealthy';
    }
    if (memory.status === 'degraded' || redis.status === 'degraded') {
      return 'degraded';
    }
    return 'healthy';
  }

  private getVersion(): string {
    try {
      // In production, you might want to read from package.json
      // For now, return a placeholder
      return process.env.npm_package_version || '0.0.1';
    } catch {
      return '0.0.1';
    }
  }
}
