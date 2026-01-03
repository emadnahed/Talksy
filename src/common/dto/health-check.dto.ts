export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface MemoryCheck {
  status: HealthStatus;
  heapUsed: number;
  heapTotal: number;
  rss: number;
  percentage: number;
}

export interface RedisCheck {
  status: HealthStatus;
  latencyMs?: number;
  usingFallback: boolean;
  message?: string;
}

export interface SessionsCheck {
  active: number;
  total: number;
}

export interface HealthCheckDto {
  status: HealthStatus;
  timestamp: string;
  version: string;
  environment: string;
  uptime: number;
  checks: {
    memory: MemoryCheck;
    redis: RedisCheck;
    sessions: SessionsCheck;
  };
}
