/**
 * Efficient sliding window for rate limiting
 * Uses a circular buffer with O(1) amortized operations instead of O(n) filter
 */
export class SlidingWindow {
  private readonly timestamps: number[];
  private head = 0; // Points to oldest valid timestamp
  private tail = 0; // Points to next write position
  private count = 0;
  private readonly capacity: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    // Allocate slightly more than maxRequests to avoid frequent resizing
    this.capacity = maxRequests + 1;
    this.timestamps = new Array(this.capacity).fill(0);
    this.windowMs = windowMs;
  }

  /**
   * Record a new request timestamp
   * O(1) operation
   */
  record(now: number): void {
    this.timestamps[this.tail] = now;
    this.tail = (this.tail + 1) % this.capacity;

    if (this.count < this.capacity) {
      this.count++;
    } else {
      // Buffer full, overwrite oldest
      this.head = (this.head + 1) % this.capacity;
    }
  }

  /**
   * Get count of requests within the current window
   * O(k) where k is number of expired entries to skip (amortized O(1))
   */
  getCount(now: number): number {
    const windowStart = now - this.windowMs;

    // Skip expired entries from head (lazy cleanup)
    while (this.count > 0 && this.timestamps[this.head] <= windowStart) {
      this.head = (this.head + 1) % this.capacity;
      this.count--;
    }

    return this.count;
  }

  /**
   * Get the oldest timestamp in the current window
   * Returns null if no timestamps exist
   */
  getOldest(now: number): number | null {
    // Ensure we've cleaned up expired entries
    this.getCount(now);

    if (this.count === 0) {
      return null;
    }

    return this.timestamps[this.head];
  }

  /**
   * Clear all timestamps
   */
  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  /**
   * Check if window is empty (no active requests)
   */
  isEmpty(now: number): boolean {
    return this.getCount(now) === 0;
  }
}
