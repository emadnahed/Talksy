import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionStorage } from './interfaces/session-storage.interface';
import { InMemoryStorageAdapter } from './adapters/in-memory-storage.adapter';
import { RedisStorageAdapter } from './adapters/redis-storage.adapter';
import { Session } from '@/session/interfaces/session.interface';

@Injectable()
export class StorageService implements SessionStorage, OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private activeAdapter!: SessionStorage;
  private usingFallback = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly inMemoryAdapter: InMemoryStorageAdapter,
    private readonly redisAdapter: RedisStorageAdapter,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initializeStorage();
  }

  async initializeStorage(): Promise<void> {
    const redisEnabled = this.configService.get<boolean>(
      'REDIS_ENABLED',
      false,
    );

    if (redisEnabled) {
      this.logger.log('Attempting to connect to Redis...');
      const connected = await this.redisAdapter.connect();

      if (connected) {
        this.activeAdapter = this.redisAdapter;
        this.usingFallback = false;
        this.logger.log('Using Redis storage adapter');
        return;
      }

      this.logger.warn('Redis connection failed, falling back to in-memory');
    }

    this.activeAdapter = this.inMemoryAdapter;
    this.usingFallback = redisEnabled; // Only true if Redis was enabled but failed
    this.logger.log('Using in-memory storage adapter');
  }

  async get(key: string): Promise<Session | null> {
    try {
      return await this.activeAdapter.get(key);
    } catch (error) {
      if (this.activeAdapter === this.redisAdapter) {
        this.logger.warn(
          `Redis error during get, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        await this.switchToFallback();
        return this.activeAdapter.get(key);
      }
      throw error;
    }
  }

  async set(key: string, value: Session, ttlMs?: number): Promise<void> {
    try {
      await this.activeAdapter.set(key, value, ttlMs);
    } catch (error) {
      if (this.activeAdapter === this.redisAdapter) {
        this.logger.warn(
          `Redis error during set, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        await this.switchToFallback();
        await this.activeAdapter.set(key, value, ttlMs);
        return;
      }
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      return await this.activeAdapter.delete(key);
    } catch (error) {
      if (this.activeAdapter === this.redisAdapter) {
        this.logger.warn(
          `Redis error during delete, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        await this.switchToFallback();
        return this.activeAdapter.delete(key);
      }
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      return await this.activeAdapter.has(key);
    } catch (error) {
      if (this.activeAdapter === this.redisAdapter) {
        this.logger.warn(
          `Redis error during has, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        await this.switchToFallback();
        return this.activeAdapter.has(key);
      }
      throw error;
    }
  }

  async keys(): Promise<string[]> {
    try {
      return await this.activeAdapter.keys();
    } catch (error) {
      if (this.activeAdapter === this.redisAdapter) {
        this.logger.warn(
          `Redis error during keys, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        await this.switchToFallback();
        return this.activeAdapter.keys();
      }
      throw error;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.activeAdapter.clear();
    } catch (error) {
      if (this.activeAdapter === this.redisAdapter) {
        this.logger.warn(
          `Redis error during clear, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        await this.switchToFallback();
        await this.activeAdapter.clear();
        return;
      }
      throw error;
    }
  }

  async count(): Promise<number> {
    try {
      return await this.activeAdapter.count();
    } catch (error) {
      if (this.activeAdapter === this.redisAdapter) {
        this.logger.warn(
          `Redis error during count, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        await this.switchToFallback();
        return this.activeAdapter.count();
      }
      throw error;
    }
  }

  async isHealthy(): Promise<boolean> {
    return this.activeAdapter.isHealthy();
  }

  getType(): string {
    return this.activeAdapter.getType();
  }

  isUsingFallback(): boolean {
    return this.usingFallback;
  }

  isUsingRedis(): boolean {
    return this.activeAdapter === this.redisAdapter && !this.usingFallback;
  }

  async getRedisLatency(): Promise<number | null> {
    if (this.activeAdapter === this.redisAdapter) {
      return this.redisAdapter.getLatency();
    }
    return null;
  }

  private async switchToFallback(): Promise<void> {
    this.activeAdapter = this.inMemoryAdapter;
    this.usingFallback = true;
    this.logger.warn('Switched to in-memory storage fallback');
  }

  /**
   * Attempt to reconnect to Redis if using fallback
   */
  async attemptRedisReconnection(): Promise<boolean> {
    if (!this.usingFallback) {
      return this.isUsingRedis();
    }

    const connected = await this.redisAdapter.connect();
    if (connected) {
      this.activeAdapter = this.redisAdapter;
      this.usingFallback = false;
      this.logger.log('Successfully reconnected to Redis');
      return true;
    }

    return false;
  }
}
