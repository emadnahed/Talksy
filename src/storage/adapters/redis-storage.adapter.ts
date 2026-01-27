import { Injectable, Logger } from '@nestjs/common';
import { Session } from '@/session/interfaces/session.interface';
import { RedisPoolService } from '@/redis/redis-pool.service';
import { SessionStorage } from '../interfaces/session-storage.interface';

@Injectable()
export class RedisStorageAdapter implements SessionStorage {
  private readonly logger = new Logger(RedisStorageAdapter.name);
  private readonly keyPrefix: string;

  constructor(private readonly redisPool: RedisPoolService) {
    this.keyPrefix = this.redisPool.getKeyPrefix();
  }

  async connect(): Promise<boolean> {
    // Connection is managed by RedisPoolService
    return this.redisPool.isAvailable();
  }

  private getFullKey(key: string): string {
    return `${this.keyPrefix}session:${key}`;
  }

  private getClient() {
    const client = this.redisPool.getClient();
    if (!client) {
      throw new Error('Redis not connected');
    }
    return client;
  }

  private serializeSession(session: Session): string {
    return JSON.stringify({
      ...session,
      createdAt: session.createdAt.toISOString(),
      lastActivityAt: session.lastActivityAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      disconnectedAt: session.disconnectedAt?.toISOString(),
    });
  }

  private deserializeSession(data: string): Session {
    const parsed = JSON.parse(data);
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      lastActivityAt: new Date(parsed.lastActivityAt),
      expiresAt: new Date(parsed.expiresAt),
      disconnectedAt: parsed.disconnectedAt
        ? new Date(parsed.disconnectedAt)
        : undefined,
    };
  }

  async get(key: string): Promise<Session | null> {
    const client = this.getClient();

    try {
      const data = await client.get(this.getFullKey(key));
      if (!data) {
        return null;
      }
      return this.deserializeSession(data);
    } catch (error) {
      this.logger.error(
        `Redis get error for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async set(key: string, value: Session, ttlMs?: number): Promise<void> {
    const client = this.getClient();

    try {
      const fullKey = this.getFullKey(key);
      const serialized = this.serializeSession(value);

      if (ttlMs) {
        await client.set(fullKey, serialized, 'PX', ttlMs);
      } else {
        await client.set(fullKey, serialized);
      }
    } catch (error) {
      this.logger.error(
        `Redis set error for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    const client = this.getClient();

    try {
      const result = await client.del(this.getFullKey(key));
      return result > 0;
    } catch (error) {
      this.logger.error(
        `Redis delete error for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    const client = this.getClient();

    try {
      const result = await client.exists(this.getFullKey(key));
      return result > 0;
    } catch (error) {
      this.logger.error(
        `Redis exists error for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async keys(): Promise<string[]> {
    const client = this.getClient();

    try {
      const pattern = `${this.keyPrefix}session:*`;
      const fullKeys = await client.keys(pattern);
      const prefixLength = `${this.keyPrefix}session:`.length;
      return fullKeys.map((k) => k.substring(prefixLength));
    } catch (error) {
      this.logger.error(
        `Redis keys error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async clear(): Promise<void> {
    const client = this.getClient();

    try {
      const pattern = `${this.keyPrefix}session:*`;
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(...keys);
      }
      this.logger.debug(`Cleared ${keys.length} sessions from Redis`);
    } catch (error) {
      this.logger.error(
        `Redis clear error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async count(): Promise<number> {
    const client = this.getClient();

    try {
      const pattern = `${this.keyPrefix}session:*`;
      const keys = await client.keys(pattern);
      return keys.length;
    } catch (error) {
      this.logger.error(
        `Redis count error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async isHealthy(): Promise<boolean> {
    return this.redisPool.isHealthy();
  }

  async getLatency(): Promise<number | null> {
    return this.redisPool.getLatency();
  }

  getType(): string {
    return 'redis';
  }

  isConnectedStatus(): boolean {
    return this.redisPool.isAvailable();
  }
}
