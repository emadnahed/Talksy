import { IoAdapter } from '@nestjs/platform-socket.io';
import { INestApplication, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient, RedisClientType } from 'redis';
import { ServerOptions } from 'socket.io';

export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;
  private pubClient: RedisClientType | null = null;
  private subClient: RedisClientType | null = null;

  constructor(
    app: INestApplication,
    private readonly configService: ConfigService,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<boolean> {
    const redisEnabled = this.configService.get<boolean>(
      'REDIS_ENABLED',
      false,
    );

    if (!redisEnabled) {
      this.logger.log(
        'Redis is disabled - WebSocket adapter running in single-instance mode',
      );
      return false;
    }

    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD', '');

    const redisUrl = password
      ? `redis://:${password}@${host}:${port}`
      : `redis://${host}:${port}`;

    try {
      this.pubClient = createClient({ url: redisUrl });
      this.subClient = this.pubClient.duplicate();

      this.pubClient.on('error', (err) => {
        this.logger.error(`Redis pub client error: ${err.message}`);
      });

      this.subClient.on('error', (err) => {
        this.logger.error(`Redis sub client error: ${err.message}`);
      });

      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);

      this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
      this.logger.log(
        'Socket.IO Redis adapter connected - horizontal scaling enabled',
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to connect Socket.IO Redis adapter: ${error instanceof Error ? error.message : 'Unknown error'}. Running in single-instance mode.`,
      );
      return false;
    }
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, {
      ...options,
      cors: {
        origin: this.configService.get<string>('CORS_ORIGIN', '*'),
        credentials: true,
      },
    });

    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }

    return server;
  }

  async close(): Promise<void> {
    if (this.pubClient) {
      await this.pubClient.quit();
    }
    if (this.subClient) {
      await this.subClient.quit();
    }
    this.logger.log('Socket.IO Redis adapter closed');
  }
}
