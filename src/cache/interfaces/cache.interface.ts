import { IUser } from '@/user/interfaces/user.interface';
import { IAuthUser } from '@/auth/interfaces/auth-user.interface';

/**
 * Cache configuration options
 */
export interface CacheConfig {
  enabled: boolean;
  userTtlMs: number;
  userMaxSize: number;
  tokenTtlMs: number;
  tokenMaxSize: number;
}

/**
 * Cached user data - stores full user for in-memory cache
 * Note: This is safe because the cache is in-memory only (not persisted)
 * and is cleared on application restart
 */
export interface CachedUser extends IUser {}

/**
 * Cached token validation result
 */
export interface CachedTokenValidation extends IAuthUser {
  cachedAt: number;
}

/**
 * Cache statistics for monitoring
 */
export interface CacheStats {
  userCache: {
    hits: number;
    misses: number;
    evictions: number;
    size: number;
    hitRate: number;
  };
  tokenCache: {
    hits: number;
    misses: number;
    evictions: number;
    size: number;
    hitRate: number;
  };
}

/**
 * Convert IUser to CachedUser
 */
export function toCachedUser(user: IUser): CachedUser {
  return {
    id: user.id,
    email: user.email,
    passwordHash: user.passwordHash,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
