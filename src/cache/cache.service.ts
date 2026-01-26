import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { LRUCache } from './lru-cache';
import {
  CacheConfig,
  CachedUser,
  CachedTokenValidation,
  CacheStats,
} from './interfaces/cache.interface';
import { IAuthUser } from '@/auth/interfaces/auth-user.interface';

@Injectable()
export class CacheService implements OnModuleInit {
  private readonly logger = new Logger(CacheService.name);
  private userCache!: LRUCache<CachedUser>;
  private tokenCache!: LRUCache<CachedTokenValidation>;
  private emailToIdCache!: LRUCache<string>; // Maps email -> userId for quick lookups
  private readonly config: CacheConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      enabled: this.configService.get<boolean>('AUTH_CACHE_ENABLED', true),
      userTtlMs: this.configService.get<number>('AUTH_CACHE_USER_TTL_MS', 300000), // 5 min
      userMaxSize: this.configService.get<number>('AUTH_CACHE_USER_MAX_SIZE', 1000),
      tokenTtlMs: this.configService.get<number>('AUTH_CACHE_TOKEN_TTL_MS', 300000), // 5 min
      tokenMaxSize: this.configService.get<number>('AUTH_CACHE_TOKEN_MAX_SIZE', 5000),
    };
  }

  onModuleInit(): void {
    this.initializeCaches();
  }

  private initializeCaches(): void {
    if (!this.config.enabled) {
      this.logger.log('Auth caching is disabled');
      // Create minimal caches that won't store anything
      this.userCache = new LRUCache<CachedUser>(1, 0);
      this.tokenCache = new LRUCache<CachedTokenValidation>(1, 0);
      this.emailToIdCache = new LRUCache<string>(1, 0);
      return;
    }

    this.userCache = new LRUCache<CachedUser>(
      this.config.userMaxSize,
      this.config.userTtlMs,
    );

    this.tokenCache = new LRUCache<CachedTokenValidation>(
      this.config.tokenMaxSize,
      this.config.tokenTtlMs,
    );

    this.emailToIdCache = new LRUCache<string>(
      this.config.userMaxSize,
      this.config.userTtlMs,
    );

    this.logger.log(
      `Auth caching enabled - User cache: ${this.config.userMaxSize} entries, ` +
      `Token cache: ${this.config.tokenMaxSize} entries, TTL: ${this.config.userTtlMs}ms`,
    );
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  // ==================== User Cache ====================

  /**
   * Get a user from cache by ID
   */
  getUser(userId: string): CachedUser | undefined {
    if (!this.config.enabled) return undefined;

    const user = this.userCache.get(userId);
    if (user) {
      this.logger.debug(`User cache HIT: ${userId}`);
    }
    return user;
  }

  /**
   * Get a user ID from cache by email
   */
  getUserIdByEmail(email: string): string | undefined {
    if (!this.config.enabled) return undefined;

    const normalizedEmail = email.toLowerCase();
    return this.emailToIdCache.get(normalizedEmail);
  }

  /**
   * Cache a user
   */
  setUser(user: CachedUser): void {
    if (!this.config.enabled) return;

    this.userCache.set(user.id, user);
    this.emailToIdCache.set(user.email.toLowerCase(), user.id);
    this.logger.debug(`User cached: ${user.id}`);
  }

  /**
   * Invalidate a user from cache
   */
  invalidateUser(userId: string, email?: string): void {
    if (!this.config.enabled) return;

    this.userCache.delete(userId);
    if (email) {
      this.emailToIdCache.delete(email.toLowerCase());
    }
    this.logger.debug(`User cache invalidated: ${userId}`);
  }

  // ==================== Token Cache ====================

  /**
   * Hash a token for use as cache key (never store raw tokens)
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex').substring(0, 32);
  }

  /**
   * Get a validated token result from cache
   */
  getTokenValidation(token: string): IAuthUser | undefined {
    if (!this.config.enabled) return undefined;

    const tokenHash = this.hashToken(token);
    const cached = this.tokenCache.get(tokenHash);

    if (cached) {
      this.logger.debug(`Token cache HIT: ${tokenHash.substring(0, 8)}...`);
      return {
        userId: cached.userId,
        email: cached.email,
      };
    }
    return undefined;
  }

  /**
   * Cache a validated token result
   * @param token The raw JWT token
   * @param authUser The validated user info
   * @param ttlMs Optional TTL (use remaining token lifetime)
   */
  setTokenValidation(token: string, authUser: IAuthUser, ttlMs?: number): void {
    if (!this.config.enabled) return;

    const tokenHash = this.hashToken(token);
    const cached: CachedTokenValidation = {
      ...authUser,
      cachedAt: Date.now(),
    };

    this.tokenCache.set(tokenHash, cached, ttlMs);
    this.logger.debug(`Token cached: ${tokenHash.substring(0, 8)}...`);
  }

  /**
   * Invalidate a specific token from cache
   */
  invalidateToken(token: string): void {
    if (!this.config.enabled) return;

    const tokenHash = this.hashToken(token);
    this.tokenCache.delete(tokenHash);
    this.logger.debug(`Token cache invalidated: ${tokenHash.substring(0, 8)}...`);
  }

  /**
   * Invalidate all tokens for a user (on logout-all or password change)
   * Note: This clears the entire token cache as we don't track user->token mapping
   */
  invalidateAllTokensForUser(userId: string): void {
    if (!this.config.enabled) return;

    // Since we don't maintain a reverse index of userId -> tokenHashes,
    // we clear the token cache on security-critical events
    // This is a trade-off: simpler implementation vs. more aggressive invalidation
    this.tokenCache.clear();
    this.logger.debug(`All token cache cleared due to security event for user: ${userId}`);
  }

  // ==================== Maintenance ====================

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const userMetrics = this.userCache.getMetrics();
    const tokenMetrics = this.tokenCache.getMetrics();

    return {
      userCache: {
        hits: userMetrics.hits,
        misses: userMetrics.misses,
        evictions: userMetrics.evictions,
        size: userMetrics.size,
        hitRate: this.userCache.getHitRate(),
      },
      tokenCache: {
        hits: tokenMetrics.hits,
        misses: tokenMetrics.misses,
        evictions: tokenMetrics.evictions,
        size: tokenMetrics.size,
        hitRate: this.tokenCache.getHitRate(),
      },
    };
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    this.userCache.clear();
    this.tokenCache.clear();
    this.emailToIdCache.clear();
    this.logger.log('All caches cleared');
  }

  /**
   * Prune expired entries from all caches
   * @returns Total number of entries pruned
   */
  prune(): number {
    const userPruned = this.userCache.prune();
    const tokenPruned = this.tokenCache.prune();
    const emailPruned = this.emailToIdCache.prune();
    const total = userPruned + tokenPruned + emailPruned;

    if (total > 0) {
      this.logger.debug(`Pruned ${total} expired cache entries`);
    }

    return total;
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.userCache.resetMetrics();
    this.tokenCache.resetMetrics();
    this.emailToIdCache.resetMetrics();
  }
}
