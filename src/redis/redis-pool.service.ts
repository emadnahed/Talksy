import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface RedisPoolConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  enabled: boolean;
}

/**
 * Singleton Redis connection pool service
 * Provides shared Redis connections across all services to reduce resource usage
 */
@Injectable()
export class RedisPoolService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisPoolService.name);
  private primaryClient: Redis | null = null;
  private readonly config: RedisPoolConfig;
  private isConnected = false;
  private connectionPromise: Promise<boolean> | null = null;

  constructor(private readonly configService: ConfigService) {
    const redisEnabled =
      this.configService.get<boolean | string>('REDIS_ENABLED', false) === true ||
      this.configService.get<boolean | string>('REDIS_ENABLED', false) === 'true';

    this.config = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD', '') || undefined,
      db: this.configService.get<number>('REDIS_DB', 0),
      keyPrefix: this.configService.get<string>('REDIS_KEY_PREFIX', 'talksy:'),
      enabled: redisEnabled,
    };
  }

  async onModuleInit(): Promise<void> {
    if (this.config.enabled) {
      await this.connect();
    } else {
      this.logger.warn(
        'Redis disabled via configuration. Services will use in-memory fallbacks.',
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Get the shared Redis client
   * Returns null if Redis is disabled or not connected
   */
  getClient(): Redis | null {
    if (!this.isConnected || !this.primaryClient) {
      return null;
    }
    return this.primaryClient;
  }

  /**
   * Check if Redis is enabled and connected
   */
  isAvailable(): boolean {
    return this.config.enabled && this.isConnected && this.primaryClient !== null;
  }

  /**
   * Check if Redis is enabled in configuration
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get the configured key prefix
   */
  getKeyPrefix(): string {
    return this.config.keyPrefix;
  }

  /**
   * Connect to Redis (idempotent - safe to call multiple times)
   */
  async connect(): Promise<boolean> {
    // Return existing connection promise if connection is in progress
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // Already connected
    if (this.isConnected && this.primaryClient) {
      return true;
    }

    // Not enabled
    if (!this.config.enabled) {
      return false;
    }

    this.connectionPromise = this.doConnect();
    const result = await this.connectionPromise;
    this.connectionPromise = null;
    return result;
  }

  private async doConnect(): Promise<boolean> {
    try {
      this.primaryClient = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        lazyConnect: true,
        connectTimeout: 5000,
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            return null; // Stop retrying
          }
          return Math.min(times * 200, 1000);
        },
        enableReadyCheck: true,
      });

      this.primaryClient.on('error', (err) => {
        this.logger.error(`Redis pool error: ${err.message}`);
        this.isConnected = false;
      });

      this.primaryClient.on('connect', () => {
        this.logger.log('Redis pool connected');
        this.isConnected = true;
      });

      this.primaryClient.on('close', () => {
        this.logger.warn('Redis pool connection closed');
        this.isConnected = false;
      });

      this.primaryClient.on('reconnecting', () => {
        this.logger.debug('Redis pool reconnecting...');
      });

      await this.primaryClient.connect();
      this.isConnected = true;
      this.logger.log(
        `Redis pool initialized: ${this.config.host}:${this.config.port}, db: ${this.config.db}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to connect Redis pool: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      this.primaryClient = null;
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.primaryClient) {
      try {
        await this.primaryClient.quit();
        this.logger.log('Redis pool disconnected');
      } catch (error) {
        this.logger.warn(
          `Error disconnecting Redis pool: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      } finally {
        this.primaryClient = null;
        this.isConnected = false;
      }
    }
  }

  /**
   * Check Redis health
   */
  async isHealthy(): Promise<boolean> {
    if (!this.primaryClient || !this.isConnected) {
      return false;
    }

    try {
      const result = await this.primaryClient.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Get Redis latency in milliseconds
   */
  async getLatency(): Promise<number | null> {
    if (!this.primaryClient || !this.isConnected) {
      return null;
    }

    try {
      const start = Date.now();
      await this.primaryClient.ping();
      return Date.now() - start;
    } catch {
      return null;
    }
  }
}
