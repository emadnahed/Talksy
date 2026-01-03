import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Session } from '@/session/interfaces/session.interface';
import { SessionStorage } from '../interfaces/session-storage.interface';

@Injectable()
export class RedisStorageAdapter implements SessionStorage, OnModuleDestroy {
  private readonly logger = new Logger(RedisStorageAdapter.name);
  private client: Redis | null = null;
  private readonly keyPrefix: string;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    this.keyPrefix = this.configService.get<string>(
      'REDIS_KEY_PREFIX',
      'talksy:',
    );
  }

  async connect(): Promise<boolean> {
    if (this.isConnected && this.client) {
      return true;
    }

    const redisEnabled = this.configService.get<boolean>(
      'REDIS_ENABLED',
      false,
    );
    if (!redisEnabled) {
      this.logger.debug('Redis is disabled via configuration');
      return false;
    }

    try {
      const host = this.configService.get<string>('REDIS_HOST', 'localhost');
      const port = this.configService.get<number>('REDIS_PORT', 6379);
      const password = this.configService.get<string>('REDIS_PASSWORD', '');
      const db = this.configService.get<number>('REDIS_DB', 0);

      this.client = new Redis({
        host,
        port,
        password: password || undefined,
        db,
        lazyConnect: true,
        connectTimeout: 5000,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            return null; // Stop retrying
          }
          return Math.min(times * 200, 1000);
        },
      });

      this.client.on('error', (err) => {
        this.logger.error(`Redis connection error: ${err.message}`);
        this.isConnected = false;
      });

      this.client.on('connect', () => {
        this.logger.log('Redis connected');
        this.isConnected = true;
      });

      this.client.on('close', () => {
        this.logger.warn('Redis connection closed');
        this.isConnected = false;
      });

      await this.client.connect();
      this.isConnected = true;
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to connect to Redis: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      this.isConnected = false;
      return false;
    }
  }

  private getFullKey(key: string): string {
    return `${this.keyPrefix}session:${key}`;
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
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not connected');
    }

    try {
      const data = await this.client.get(this.getFullKey(key));
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
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not connected');
    }

    try {
      const fullKey = this.getFullKey(key);
      const serialized = this.serializeSession(value);

      if (ttlMs) {
        await this.client.set(fullKey, serialized, 'PX', ttlMs);
      } else {
        await this.client.set(fullKey, serialized);
      }
    } catch (error) {
      this.logger.error(
        `Redis set error for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not connected');
    }

    try {
      const result = await this.client.del(this.getFullKey(key));
      return result > 0;
    } catch (error) {
      this.logger.error(
        `Redis delete error for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not connected');
    }

    try {
      const result = await this.client.exists(this.getFullKey(key));
      return result > 0;
    } catch (error) {
      this.logger.error(
        `Redis exists error for key ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async keys(): Promise<string[]> {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not connected');
    }

    try {
      const pattern = `${this.keyPrefix}session:*`;
      const fullKeys = await this.client.keys(pattern);
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
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not connected');
    }

    try {
      const pattern = `${this.keyPrefix}session:*`;
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(...keys);
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
    if (!this.client || !this.isConnected) {
      throw new Error('Redis not connected');
    }

    try {
      const pattern = `${this.keyPrefix}session:*`;
      const keys = await this.client.keys(pattern);
      return keys.length;
    } catch (error) {
      this.logger.error(
        `Redis count error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.client || !this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  async getLatency(): Promise<number | null> {
    if (!this.client || !this.isConnected) {
      return null;
    }

    try {
      const start = Date.now();
      await this.client.ping();
      return Date.now() - start;
    } catch {
      return null;
    }
  }

  getType(): string {
    return 'redis';
  }

  isConnectedStatus(): boolean {
    return this.isConnected;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      this.logger.log('Redis connection closed');
    }
  }
}
