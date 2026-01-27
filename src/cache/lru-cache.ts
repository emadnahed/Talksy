/**
 * LRU (Least Recently Used) Cache Implementation
 *
 * A high-performance cache with O(1) get/set/delete operations.
 * Uses a Map for storage and tracks access order for LRU eviction.
 *
 * Features:
 * - Configurable max size with automatic LRU eviction
 * - TTL (Time To Live) support per entry
 * - Metrics tracking (hits, misses, evictions)
 * - No external dependencies
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  accessedAt: number;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  maxSize: number;
}

export class LRUCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;

  // Metrics
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  /**
   * Create a new LRU Cache
   * @param maxSize Maximum number of entries (default: 1000)
   * @param defaultTtlMs Default TTL in milliseconds (default: 5 minutes)
   */
  constructor(maxSize = 1000, defaultTtlMs = 300000) {
    if (maxSize < 1) {
      throw new Error('Cache maxSize must be at least 1');
    }
    if (defaultTtlMs < 0) {
      throw new Error('Cache defaultTtlMs must be non-negative');
    }
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
  }

  /**
   * Get a value from the cache
   * @param key Cache key
   * @returns The cached value or undefined if not found/expired
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check if expired
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Update access time for LRU tracking
    entry.accessedAt = Date.now();
    this.hits++;

    // Move to end (most recently used) by re-inserting
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set a value in the cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttlMs Optional TTL override (0 = no expiration)
   */
  set(key: string, value: T, ttlMs?: number): void {
    const now = Date.now();
    const ttl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;

    // If key exists, delete it first to maintain order
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict if at capacity
    while (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      value,
      expiresAt: ttl > 0 ? now + ttl : 0,
      accessedAt: now,
    };

    this.cache.set(key, entry);
  }

  /**
   * Delete a value from the cache
   * @param key Cache key
   * @returns true if the key existed and was deleted
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Check if a key exists in the cache (without updating access time)
   * @param key Cache key
   * @returns true if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check expiration
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the current number of entries
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * Get hit rate as a percentage (0-100)
   */
  getHitRate(): number {
    const total = this.hits + this.misses;
    if (total === 0) return 0;
    return (this.hits / total) * 100;
  }

  /**
   * Reset metrics counters
   */
  resetMetrics(): void {
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  /**
   * Get all keys (for debugging/testing)
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Prune expired entries
   * @returns Number of entries pruned
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt > 0 && now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Evict the least recently used entry
   */
  private evictLRU(): void {
    // Map maintains insertion order, so first key is least recently used
    const firstKey = this.cache.keys().next().value;
    if (firstKey !== undefined) {
      this.cache.delete(firstKey);
      this.evictions++;
    }
  }
}
