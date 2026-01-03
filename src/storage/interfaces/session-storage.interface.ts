import { Session } from '@/session/interfaces/session.interface';

export interface SessionStorage {
  /**
   * Get a session by key
   */
  get(key: string): Promise<Session | null>;

  /**
   * Set a session with optional TTL
   */
  set(key: string, value: Session, ttlMs?: number): Promise<void>;

  /**
   * Delete a session by key
   * @returns true if session existed and was deleted
   */
  delete(key: string): Promise<boolean>;

  /**
   * Check if a session exists
   */
  has(key: string): Promise<boolean>;

  /**
   * Get all session keys
   */
  keys(): Promise<string[]>;

  /**
   * Clear all sessions
   */
  clear(): Promise<void>;

  /**
   * Get the count of stored sessions
   */
  count(): Promise<number>;

  /**
   * Check if the storage backend is healthy
   */
  isHealthy(): Promise<boolean>;

  /**
   * Get the storage type name
   */
  getType(): string;
}
