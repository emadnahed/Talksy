/**
 * Circular Buffer Implementation
 *
 * A fixed-size buffer that overwrites the oldest entries when full.
 * Provides O(1) push operations instead of O(n) Array.shift().
 *
 * Features:
 * - O(1) push operation
 * - Automatic overwrite of oldest entries when capacity reached
 * - Iteration in chronological order (oldest to newest)
 * - No memory reallocation after initialization
 */
export class CircularBuffer<T> {
  private readonly buffer: (T | undefined)[];
  private head = 0; // Next write position
  private size = 0;
  private readonly capacity: number;

  /**
   * Create a new CircularBuffer
   * @param capacity Maximum number of elements
   */
  constructor(capacity: number) {
    if (capacity < 1) {
      throw new Error('CircularBuffer capacity must be at least 1');
    }
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * Add an element to the buffer
   * If at capacity, overwrites the oldest element
   * @param item Element to add
   */
  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;

    if (this.size < this.capacity) {
      this.size++;
    }
  }

  /**
   * Get all elements in chronological order (oldest to newest)
   * @returns Array of elements
   */
  toArray(): T[] {
    if (this.size === 0) {
      return [];
    }

    const result: T[] = [];

    if (this.size < this.capacity) {
      // Buffer not full yet, elements are at indices 0 to size-1
      for (let i = 0; i < this.size; i++) {
        result.push(this.buffer[i] as T);
      }
    } else {
      // Buffer is full, oldest element is at head position
      for (let i = 0; i < this.capacity; i++) {
        const index = (this.head + i) % this.capacity;
        result.push(this.buffer[index] as T);
      }
    }

    return result;
  }

  /**
   * Get the number of elements in the buffer
   */
  length(): number {
    return this.size;
  }

  /**
   * Check if the buffer is empty
   */
  isEmpty(): boolean {
    return this.size === 0;
  }

  /**
   * Check if the buffer is at capacity
   */
  isFull(): boolean {
    return this.size === this.capacity;
  }

  /**
   * Clear all elements from the buffer
   */
  clear(): void {
    this.buffer.fill(undefined);
    this.head = 0;
    this.size = 0;
  }

  /**
   * Get the maximum capacity of the buffer
   */
  getCapacity(): number {
    return this.capacity;
  }

  /**
   * Get the most recent element (last added)
   * @returns The most recent element or undefined if empty
   */
  peekLast(): T | undefined {
    if (this.size === 0) {
      return undefined;
    }
    const lastIndex = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[lastIndex];
  }

  /**
   * Get the oldest element
   * @returns The oldest element or undefined if empty
   */
  peekFirst(): T | undefined {
    if (this.size === 0) {
      return undefined;
    }
    if (this.size < this.capacity) {
      return this.buffer[0];
    }
    return this.buffer[this.head];
  }

  /**
   * Iterator support for for...of loops
   */
  *[Symbol.iterator](): Iterator<T> {
    const items = this.toArray();
    for (const item of items) {
      yield item;
    }
  }
}
