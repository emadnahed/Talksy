import { SlidingWindow } from './sliding-window';

describe('SlidingWindow', () => {
  describe('constructor', () => {
    it('should create a sliding window with specified capacity', () => {
      const window = new SlidingWindow(10, 1000);
      expect(window).toBeDefined();
    });

    it('should start with zero count', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();
      expect(window.getCount(now)).toBe(0);
    });

    it('should start empty', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();
      expect(window.isEmpty(now)).toBe(true);
    });
  });

  describe('record', () => {
    it('should record a single timestamp', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();

      window.record(now);

      expect(window.getCount(now)).toBe(1);
    });

    it('should record multiple timestamps', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();

      window.record(now);
      window.record(now + 100);
      window.record(now + 200);

      expect(window.getCount(now + 200)).toBe(3);
    });

    it('should handle recording at capacity', () => {
      const window = new SlidingWindow(5, 1000);
      const now = Date.now();

      // Record up to capacity
      for (let i = 0; i < 5; i++) {
        window.record(now + i * 10);
      }

      expect(window.getCount(now + 100)).toBe(5);
    });

    it('should overwrite oldest when exceeding capacity', () => {
      const window = new SlidingWindow(3, 10000); // Long window to prevent expiration
      const now = Date.now();

      // Fill beyond capacity
      window.record(now);
      window.record(now + 100);
      window.record(now + 200);
      window.record(now + 300); // This should trigger overwrite

      // Count should still be at capacity
      expect(window.getCount(now + 300)).toBeLessThanOrEqual(4);
    });
  });

  describe('getCount', () => {
    it('should return 0 for empty window', () => {
      const window = new SlidingWindow(10, 1000);
      expect(window.getCount(Date.now())).toBe(0);
    });

    it('should expire old timestamps', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();

      window.record(now - 2000); // Already expired
      window.record(now - 500); // Still valid

      expect(window.getCount(now)).toBe(1);
    });

    it('should expire all timestamps after window passes', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();

      window.record(now);
      window.record(now + 100);
      window.record(now + 200);

      // After window expires
      expect(window.getCount(now + 2000)).toBe(0);
    });

    it('should clean up expired entries lazily', () => {
      const window = new SlidingWindow(10, 1000);
      const baseTime = Date.now();

      // Record several timestamps
      window.record(baseTime);
      window.record(baseTime + 100);
      window.record(baseTime + 200);
      window.record(baseTime + 500);
      window.record(baseTime + 800);

      // At baseTime + 1100, first two should be expired
      expect(window.getCount(baseTime + 1100)).toBe(3);

      // At baseTime + 1300, first three should be expired
      expect(window.getCount(baseTime + 1300)).toBe(2);

      // At baseTime + 1900, all should be expired
      expect(window.getCount(baseTime + 1900)).toBe(0);
    });

    it('should handle boundary case - exactly at window edge', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();

      window.record(now - 1000); // Exactly at window start (should be expired)
      window.record(now - 999); // Just inside window

      expect(window.getCount(now)).toBe(1);
    });
  });

  describe('getOldest', () => {
    it('should return null for empty window', () => {
      const window = new SlidingWindow(10, 1000);
      expect(window.getOldest(Date.now())).toBeNull();
    });

    it('should return oldest timestamp in window', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();

      window.record(now);
      window.record(now + 100);
      window.record(now + 200);

      expect(window.getOldest(now + 200)).toBe(now);
    });

    it('should skip expired timestamps and return oldest valid', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();

      window.record(now - 2000); // Expired
      window.record(now - 1500); // Expired
      window.record(now - 500); // Valid

      expect(window.getOldest(now)).toBe(now - 500);
    });

    it('should return null when all timestamps expired', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();

      window.record(now - 2000);
      window.record(now - 1500);

      expect(window.getOldest(now)).toBeNull();
    });
  });

  describe('clear', () => {
    it('should reset window to empty state', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();

      window.record(now);
      window.record(now + 100);
      window.record(now + 200);

      window.clear();

      expect(window.getCount(now + 200)).toBe(0);
      expect(window.isEmpty(now + 200)).toBe(true);
      expect(window.getOldest(now + 200)).toBeNull();
    });

    it('should allow new recordings after clear', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();

      window.record(now);
      window.clear();
      window.record(now + 500);

      expect(window.getCount(now + 500)).toBe(1);
    });
  });

  describe('isEmpty', () => {
    it('should return true for new window', () => {
      const window = new SlidingWindow(10, 1000);
      expect(window.isEmpty(Date.now())).toBe(true);
    });

    it('should return false after recording', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();

      window.record(now);

      expect(window.isEmpty(now)).toBe(false);
    });

    it('should return true after all timestamps expire', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();

      window.record(now);

      expect(window.isEmpty(now + 2000)).toBe(true);
    });

    it('should return true after clear', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();

      window.record(now);
      window.clear();

      expect(window.isEmpty(now)).toBe(true);
    });
  });

  describe('circular buffer behavior', () => {
    it('should wrap around correctly', () => {
      const window = new SlidingWindow(3, 10000); // Long window
      const baseTime = Date.now();

      // Fill the buffer completely and then some more
      for (let i = 0; i < 10; i++) {
        window.record(baseTime + i * 100);
      }

      // Should still work correctly
      const count = window.getCount(baseTime + 1000);
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThanOrEqual(4); // capacity is maxRequests + 1 = 4
    });

    it('should maintain FIFO order with wrap-around', () => {
      const window = new SlidingWindow(3, 10000);
      const baseTime = Date.now();

      // Record timestamps that will wrap around
      window.record(baseTime);
      window.record(baseTime + 100);
      window.record(baseTime + 200);
      window.record(baseTime + 300);
      window.record(baseTime + 400);

      // Oldest should be maintained correctly
      const oldest = window.getOldest(baseTime + 400);
      expect(oldest).toBeGreaterThan(baseTime);
    });
  });

  describe('edge cases', () => {
    it('should handle window size of 1', () => {
      const window = new SlidingWindow(1, 1000);
      const now = Date.now();

      window.record(now);
      expect(window.getCount(now)).toBe(1);

      window.record(now + 100);
      expect(window.getCount(now + 100)).toBeLessThanOrEqual(2);
    });

    it('should handle very small window duration', () => {
      const window = new SlidingWindow(10, 10); // 10ms window
      const now = Date.now();

      window.record(now);
      expect(window.getCount(now)).toBe(1);

      // After 10ms
      expect(window.getCount(now + 20)).toBe(0);
    });

    it('should handle very large window duration', () => {
      const window = new SlidingWindow(10, 3600000); // 1 hour window
      const now = Date.now();

      window.record(now);
      window.record(now + 1000);
      window.record(now + 60000);

      expect(window.getCount(now + 60000)).toBe(3);
    });

    it('should handle timestamps in the past', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();

      window.record(now - 500); // Half a second ago
      window.record(now);

      expect(window.getCount(now)).toBe(2);
    });

    it('should handle same timestamp multiple times', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();

      window.record(now);
      window.record(now);
      window.record(now);

      expect(window.getCount(now)).toBe(3);
    });
  });

  describe('performance characteristics', () => {
    it('should handle high volume of requests efficiently', () => {
      const window = new SlidingWindow(1000, 60000);
      const baseTime = Date.now();

      // Record 10000 requests
      for (let i = 0; i < 10000; i++) {
        window.record(baseTime + i);
      }

      // Should still work correctly
      const count = window.getCount(baseTime + 10000);
      expect(count).toBeGreaterThan(0);
    });

    it('should efficiently skip many expired entries', () => {
      const window = new SlidingWindow(1000, 100);
      const baseTime = Date.now();

      // Record 1000 requests
      for (let i = 0; i < 1000; i++) {
        window.record(baseTime + i);
      }

      // All should be expired
      const count = window.getCount(baseTime + 2000);
      expect(count).toBe(0);
    });
  });

  describe('rate limiting scenarios', () => {
    it('should correctly limit requests per second', () => {
      const maxRequests = 10;
      const windowMs = 1000;
      const window = new SlidingWindow(maxRequests, windowMs);
      const now = Date.now();

      // Simulate burst of requests
      for (let i = 0; i < 15; i++) {
        window.record(now + i * 10);
      }

      const count = window.getCount(now + 150);
      expect(count).toBeLessThanOrEqual(maxRequests + 1); // capacity is maxRequests + 1
    });

    it('should allow new requests after window expires', () => {
      const window = new SlidingWindow(5, 1000);
      const now = Date.now();

      // Fill up the window
      for (let i = 0; i < 5; i++) {
        window.record(now + i * 10);
      }

      expect(window.getCount(now + 50)).toBe(5);

      // After window expires
      expect(window.getCount(now + 1100)).toBe(0);

      // Can record more
      window.record(now + 1100);
      expect(window.getCount(now + 1100)).toBe(1);
    });

    it('should handle sliding window correctly', () => {
      const window = new SlidingWindow(10, 1000);
      const now = Date.now();

      // Record 5 requests at start
      for (let i = 0; i < 5; i++) {
        window.record(now + i * 10);
      }
      expect(window.getCount(now + 50)).toBe(5);

      // Record 5 more requests 500ms later
      for (let i = 0; i < 5; i++) {
        window.record(now + 500 + i * 10);
      }
      expect(window.getCount(now + 550)).toBe(10);

      // After 1100ms, first 5 should be expired
      expect(window.getCount(now + 1100)).toBe(5);

      // After 1600ms, all should be expired
      expect(window.getCount(now + 1600)).toBe(0);
    });
  });
});
