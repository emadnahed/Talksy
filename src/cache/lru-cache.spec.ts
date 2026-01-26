import { LRUCache } from './lru-cache';

describe('LRUCache', () => {
  let cache: LRUCache<string>;

  beforeEach(() => {
    cache = new LRUCache<string>(3, 1000); // max 3 items, 1s TTL
  });

  describe('constructor', () => {
    it('should create cache with valid parameters', () => {
      const c = new LRUCache<number>(100, 5000);
      expect(c.size()).toBe(0);
    });

    it('should throw error for invalid maxSize', () => {
      expect(() => new LRUCache<string>(0, 1000)).toThrow('Cache maxSize must be at least 1');
      expect(() => new LRUCache<string>(-1, 1000)).toThrow('Cache maxSize must be at least 1');
    });

    it('should throw error for negative TTL', () => {
      expect(() => new LRUCache<string>(10, -1)).toThrow('Cache defaultTtlMs must be non-negative');
    });

    it('should allow zero TTL (no expiration)', () => {
      const c = new LRUCache<string>(10, 0);
      c.set('key', 'value');
      expect(c.get('key')).toBe('value');
    });
  });

  describe('set and get', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for non-existent keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should overwrite existing values', () => {
      cache.set('key1', 'value1');
      cache.set('key1', 'value2');
      expect(cache.get('key1')).toBe('value2');
      expect(cache.size()).toBe(1);
    });

    it('should handle complex values', () => {
      const complexCache = new LRUCache<{ name: string; age: number }>(10, 1000);
      const obj = { name: 'test', age: 25 };
      complexCache.set('user', obj);
      expect(complexCache.get('user')).toEqual(obj);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used item when full', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');
      // Cache is now full (3 items)

      cache.set('d', '4'); // Should evict 'a' (least recently used)

      expect(cache.get('a')).toBeUndefined();
      expect(cache.get('b')).toBe('2');
      expect(cache.get('c')).toBe('3');
      expect(cache.get('d')).toBe('4');
    });

    it('should update access order on get', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');

      // Access 'a' to make it most recently used
      cache.get('a');

      // Add new item - should evict 'b' (now least recently used)
      cache.set('d', '4');

      expect(cache.get('a')).toBe('1');
      expect(cache.get('b')).toBeUndefined();
      expect(cache.get('c')).toBe('3');
      expect(cache.get('d')).toBe('4');
    });

    it('should update access order on set (update existing)', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');

      // Update 'a' to make it most recently used
      cache.set('a', 'updated');

      // Add new item - should evict 'b'
      cache.set('d', '4');

      expect(cache.get('a')).toBe('updated');
      expect(cache.get('b')).toBeUndefined();
    });

    it('should track evictions in metrics', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');
      cache.set('d', '4'); // Evicts 'a'
      cache.set('e', '5'); // Evicts 'b'

      const metrics = cache.getMetrics();
      expect(metrics.evictions).toBe(2);
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should expire items after TTL', () => {
      cache.set('key', 'value');
      expect(cache.get('key')).toBe('value');

      // Advance time past TTL
      jest.advanceTimersByTime(1500);

      expect(cache.get('key')).toBeUndefined();
    });

    it('should respect custom TTL per item', () => {
      cache.set('short', 'value1', 500);
      cache.set('long', 'value2', 2000);

      jest.advanceTimersByTime(700);

      expect(cache.get('short')).toBeUndefined();
      expect(cache.get('long')).toBe('value2');
    });

    it('should not expire items with TTL of 0', () => {
      const noExpiryCache = new LRUCache<string>(10, 0);
      noExpiryCache.set('key', 'value');

      jest.advanceTimersByTime(100000);

      expect(noExpiryCache.get('key')).toBe('value');
    });

    it('should handle has() with expiration', () => {
      cache.set('key', 'value');
      expect(cache.has('key')).toBe(true);

      jest.advanceTimersByTime(1500);

      expect(cache.has('key')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete existing keys', () => {
      cache.set('key', 'value');
      expect(cache.delete('key')).toBe(true);
      expect(cache.get('key')).toBeUndefined();
    });

    it('should return false for non-existent keys', () => {
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should update size after delete', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);

      cache.delete('key1');
      expect(cache.size()).toBe(1);
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      cache.set('key', 'value');
      expect(cache.has('key')).toBe(true);
    });

    it('should return false for non-existent keys', () => {
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should not update access order (unlike get)', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');

      // Check 'a' without updating access order
      cache.has('a');

      // Add new item - should still evict 'a' since has() doesn't update order
      cache.set('d', '4');

      expect(cache.has('a')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all items', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
    });
  });

  describe('size', () => {
    it('should return correct size', () => {
      expect(cache.size()).toBe(0);

      cache.set('key1', 'value1');
      expect(cache.size()).toBe(1);

      cache.set('key2', 'value2');
      expect(cache.size()).toBe(2);
    });
  });

  describe('keys', () => {
    it('should return all keys', () => {
      cache.set('a', '1');
      cache.set('b', '2');
      cache.set('c', '3');

      const keys = cache.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
    });

    it('should return empty array for empty cache', () => {
      expect(cache.keys()).toEqual([]);
    });
  });

  describe('metrics', () => {
    it('should track hits and misses', () => {
      cache.set('key', 'value');

      cache.get('key'); // Hit
      cache.get('key'); // Hit
      cache.get('nonexistent'); // Miss

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(2);
      expect(metrics.misses).toBe(1);
    });

    it('should calculate hit rate', () => {
      cache.set('key', 'value');

      cache.get('key'); // Hit
      cache.get('key'); // Hit
      cache.get('nonexistent'); // Miss
      cache.get('nonexistent'); // Miss

      expect(cache.getHitRate()).toBe(50);
    });

    it('should return 0 hit rate when no accesses', () => {
      expect(cache.getHitRate()).toBe(0);
    });

    it('should reset metrics', () => {
      cache.set('key', 'value');
      cache.get('key');
      cache.get('nonexistent');

      cache.resetMetrics();

      const metrics = cache.getMetrics();
      expect(metrics.hits).toBe(0);
      expect(metrics.misses).toBe(0);
      expect(metrics.evictions).toBe(0);
    });

    it('should include size and maxSize in metrics', () => {
      cache.set('key', 'value');

      const metrics = cache.getMetrics();
      expect(metrics.size).toBe(1);
      expect(metrics.maxSize).toBe(3);
    });
  });

  describe('prune', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should remove expired entries', () => {
      cache.set('short', 'value1', 500);
      cache.set('long', 'value2', 2000);

      jest.advanceTimersByTime(700);

      const pruned = cache.prune();

      expect(pruned).toBe(1);
      expect(cache.size()).toBe(1);
      expect(cache.has('short')).toBe(false);
      expect(cache.has('long')).toBe(true);
    });

    it('should return 0 when no expired entries', () => {
      cache.set('key', 'value');
      expect(cache.prune()).toBe(0);
    });
  });
});
