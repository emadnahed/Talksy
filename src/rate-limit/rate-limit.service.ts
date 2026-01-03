import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RateLimitConfig,
  RateLimitResult,
} from './interfaces/rate-limit-config.interface';

interface ClientWindow {
  timestamps: number[];
  lastCleanup: number;
}

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly windows: Map<string, ClientWindow> = new Map();
  private readonly config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      enabled: this.configService.get<boolean>('RATE_LIMIT_ENABLED', true),
      windowMs: this.configService.get<number>('RATE_LIMIT_WINDOW_MS', 60000),
      maxRequests: this.configService.get<number>(
        'RATE_LIMIT_MAX_REQUESTS',
        10,
      ),
    };

    // Periodic cleanup of old entries
    this.cleanupInterval = setInterval(
      () => this.cleanupOldEntries(),
      this.config.windowMs,
    );
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  /**
   * Check if a request is allowed for the given client
   * Uses sliding window algorithm
   */
  checkLimit(clientId: string): RateLimitResult {
    if (!this.config.enabled) {
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetAt: Date.now() + this.config.windowMs,
      };
    }

    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    // Get or create client window
    let clientWindow = this.windows.get(clientId);
    if (!clientWindow) {
      clientWindow = { timestamps: [], lastCleanup: now };
      this.windows.set(clientId, clientWindow);
    }

    // Remove timestamps outside the window
    clientWindow.timestamps = clientWindow.timestamps.filter(
      (ts) => ts > windowStart,
    );

    const currentCount = clientWindow.timestamps.length;
    const remaining = Math.max(0, this.config.maxRequests - currentCount);
    const oldestTimestamp = clientWindow.timestamps[0] || now;
    const resetAt = oldestTimestamp + this.config.windowMs;

    if (currentCount >= this.config.maxRequests) {
      const retryAfter = Math.ceil((resetAt - now) / 1000);
      this.logger.debug(
        `Rate limit exceeded for client ${clientId}: ${currentCount}/${this.config.maxRequests}`,
      );
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter,
      };
    }

    return {
      allowed: true,
      remaining,
      resetAt,
    };
  }

  /**
   * Record a request for the given client
   * Should be called after checkLimit returns allowed=true
   */
  recordRequest(clientId: string): void {
    if (!this.config.enabled) {
      return;
    }

    const now = Date.now();
    let clientWindow = this.windows.get(clientId);

    if (!clientWindow) {
      clientWindow = { timestamps: [], lastCleanup: now };
      this.windows.set(clientId, clientWindow);
    }

    clientWindow.timestamps.push(now);
    this.logger.debug(
      `Recorded request for client ${clientId}: ${clientWindow.timestamps.length}/${this.config.maxRequests}`,
    );
  }

  /**
   * Check and record in one operation
   * Returns the result of the rate limit check
   */
  consume(clientId: string): RateLimitResult {
    const result = this.checkLimit(clientId);
    if (result.allowed) {
      this.recordRequest(clientId);
      result.remaining = Math.max(0, result.remaining - 1);
    }
    return result;
  }

  /**
   * Get the current request count for a client
   */
  getRequestCount(clientId: string): number {
    const clientWindow = this.windows.get(clientId);
    if (!clientWindow) {
      return 0;
    }

    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    return clientWindow.timestamps.filter((ts) => ts > windowStart).length;
  }

  /**
   * Reset rate limit for a specific client
   */
  resetClient(clientId: string): void {
    this.windows.delete(clientId);
    this.logger.debug(`Reset rate limit for client ${clientId}`);
  }

  /**
   * Clear all rate limit data
   */
  clearAll(): void {
    this.windows.clear();
    this.logger.debug('Cleared all rate limit data');
  }

  /**
   * Cleanup old entries that are outside the window
   */
  private cleanupOldEntries(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    let cleanedCount = 0;

    for (const [clientId, window] of this.windows.entries()) {
      // Remove old timestamps
      const originalLength = window.timestamps.length;
      window.timestamps = window.timestamps.filter((ts) => ts > windowStart);

      // Remove client if no active timestamps
      if (window.timestamps.length === 0) {
        this.windows.delete(clientId);
        cleanedCount++;
      } else if (window.timestamps.length < originalLength) {
        window.lastCleanup = now;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(
        `Cleaned up ${cleanedCount} inactive rate limit entries`,
      );
    }
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.windows.clear();
    this.logger.log('RateLimitService destroyed');
  }
}
