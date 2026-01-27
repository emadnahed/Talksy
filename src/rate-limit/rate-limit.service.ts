import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  RateLimitConfig,
  RateLimitResult,
} from './interfaces/rate-limit-config.interface';
import { SlidingWindow } from './sliding-window';

@Injectable()
export class RateLimitService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private readonly windows: Map<string, SlidingWindow> = new Map();
  private readonly config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {
    const enabledValue = this.configService.get('RATE_LIMIT_ENABLED');
    const windowMsValue = this.configService.get('RATE_LIMIT_WINDOW_MS');
    const maxRequestsValue = this.configService.get('RATE_LIMIT_MAX_REQUESTS');

    // Parse config values, handling both boolean and string types
    const parseBoolean = (value: unknown, defaultValue: boolean): boolean => {
      if (value === undefined || value === null) return defaultValue;
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') return value.toLowerCase() === 'true';
      return defaultValue;
    };

    const parseNumber = (value: unknown, defaultValue: number): number => {
      if (value === undefined || value === null) return defaultValue;
      if (typeof value === 'number') return value;
      if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? defaultValue : parsed;
      }
      return defaultValue;
    };

    this.config = {
      enabled: parseBoolean(enabledValue, true),
      windowMs: parseNumber(windowMsValue, 60000),
      maxRequests: parseNumber(maxRequestsValue, 10),
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
   * Uses sliding window algorithm with O(1) amortized operations
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

    // Get or create client window (O(1) operations via SlidingWindow)
    let clientWindow = this.windows.get(clientId);
    if (!clientWindow) {
      clientWindow = new SlidingWindow(this.config.maxRequests, this.config.windowMs);
      this.windows.set(clientId, clientWindow);
    }

    // Get count within window (O(1) amortized - lazy cleanup of expired entries)
    const currentCount = clientWindow.getCount(now);
    const remaining = Math.max(0, this.config.maxRequests - currentCount);
    const oldestTimestamp = clientWindow.getOldest(now) ?? now;
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
   * O(1) operation
   */
  recordRequest(clientId: string): void {
    if (!this.config.enabled) {
      return;
    }

    const now = Date.now();
    let clientWindow = this.windows.get(clientId);

    if (!clientWindow) {
      clientWindow = new SlidingWindow(this.config.maxRequests, this.config.windowMs);
      this.windows.set(clientId, clientWindow);
    }

    clientWindow.record(now);
    this.logger.debug(
      `Recorded request for client ${clientId}: ${clientWindow.getCount(now)}/${this.config.maxRequests}`,
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
   * O(1) amortized operation
   */
  getRequestCount(clientId: string): number {
    const clientWindow = this.windows.get(clientId);
    if (!clientWindow) {
      return 0;
    }

    return clientWindow.getCount(Date.now());
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
   * SlidingWindow handles internal cleanup lazily, this just removes empty windows
   */
  private cleanupOldEntries(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [clientId, window] of this.windows.entries()) {
      // Check if window is empty (all entries expired)
      if (window.isEmpty(now)) {
        this.windows.delete(clientId);
        cleanedCount++;
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
