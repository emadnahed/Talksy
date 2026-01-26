import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { User } from './user.entity';
import { IUser, ICreateUser, IUserPublic } from './interfaces/user.interface';

@Injectable()
export class UserService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UserService.name);
  private redisClient: Redis | null = null;
  private readonly users = new Map<string, IUser>();
  private readonly emailIndex = new Map<string, string>(); // email -> id
  private readonly keyPrefix: string;
  private readonly bcryptRounds: number;
  private isRedisConnected = false;

  constructor(private readonly configService: ConfigService) {
    this.keyPrefix = this.configService.get<string>(
      'REDIS_KEY_PREFIX',
      'talksy:',
    );
    this.bcryptRounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);
  }

  async onModuleInit(): Promise<void> {
    await this.initializeRedis();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.redisClient = null;
      this.isRedisConnected = false;
    }
  }

  private async initializeRedis(): Promise<void> {
    const redisEnabled =
      this.configService.get<boolean | string>('REDIS_ENABLED', false) === true ||
      this.configService.get<boolean | string>('REDIS_ENABLED', false) === 'true';

    if (!redisEnabled) {
      this.logger.log('Redis disabled, using in-memory user storage');
      return;
    }

    try {
      const host = this.configService.get<string>('REDIS_HOST', 'localhost');
      const port = this.configService.get<number>('REDIS_PORT', 6379);
      const password = this.configService.get<string>('REDIS_PASSWORD', '');
      const db = this.configService.get<number>('REDIS_DB', 0);

      this.redisClient = new Redis({
        host,
        port,
        password: password || undefined,
        db,
        lazyConnect: true,
        connectTimeout: 5000,
        maxRetriesPerRequest: 3,
      });

      await this.redisClient.connect();
      this.isRedisConnected = true;
      this.logger.log('User service connected to Redis');
    } catch (error) {
      this.logger.warn(
        `Failed to connect to Redis for user storage: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      this.redisClient = null;
      this.isRedisConnected = false;
    }
  }

  private getUserKey(id: string): string {
    return `${this.keyPrefix}user:${id}`;
  }

  private getEmailIndexKey(email: string): string {
    return `${this.keyPrefix}user:email:${email.toLowerCase()}`;
  }

  private serializeUser(user: IUser): string {
    return JSON.stringify({
      ...user,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    });
  }

  private deserializeUser(data: string): IUser {
    const parsed = JSON.parse(data);
    return {
      ...parsed,
      createdAt: new Date(parsed.createdAt),
      updatedAt: new Date(parsed.updatedAt),
    };
  }

  async create(createUserDto: ICreateUser): Promise<User> {
    const email = createUserDto.email.toLowerCase();

    // Check if email already exists
    const existingUser = await this.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const now = new Date();
    const user: IUser = {
      id: uuidv4(),
      email,
      passwordHash: await bcrypt.hash(createUserDto.password, this.bcryptRounds),
      createdAt: now,
      updatedAt: now,
    };

    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.set(this.getUserKey(user.id), this.serializeUser(user));
        await this.redisClient.set(this.getEmailIndexKey(email), user.id);
        this.logger.debug(`User ${user.id} created in Redis`);
      } catch (error) {
        this.logger.warn(
          `Redis error, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        this.isRedisConnected = false;
        this.users.set(user.id, user);
        this.emailIndex.set(email, user.id);
      }
    } else {
      this.users.set(user.id, user);
      this.emailIndex.set(email, user.id);
    }

    return new User(user);
  }

  async findById(id: string): Promise<User | null> {
    if (this.isRedisConnected && this.redisClient) {
      try {
        const data = await this.redisClient.get(this.getUserKey(id));
        if (!data) return null;
        return new User(this.deserializeUser(data));
      } catch (error) {
        this.logger.warn(
          `Redis error, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        this.isRedisConnected = false;
      }
    }

    const user = this.users.get(id);
    return user ? new User(user) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase();

    if (this.isRedisConnected && this.redisClient) {
      try {
        const userId = await this.redisClient.get(this.getEmailIndexKey(normalizedEmail));
        if (!userId) return null;
        return this.findById(userId);
      } catch (error) {
        this.logger.warn(
          `Redis error, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        this.isRedisConnected = false;
      }
    }

    const userId = this.emailIndex.get(normalizedEmail);
    if (!userId) return null;
    return this.findById(userId);
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash);
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser: IUser = {
      ...user,
      passwordHash: await bcrypt.hash(newPassword, this.bcryptRounds),
      updatedAt: new Date(),
    };

    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.set(
          this.getUserKey(userId),
          this.serializeUser(updatedUser),
        );
      } catch (error) {
        this.logger.warn(
          `Redis error, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        this.isRedisConnected = false;
        this.users.set(userId, updatedUser);
      }
    } else {
      this.users.set(userId, updatedUser);
    }
  }

  async deleteUser(userId: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user) return false;

    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.del(this.getUserKey(userId));
        await this.redisClient.del(this.getEmailIndexKey(user.email));
        return true;
      } catch (error) {
        this.logger.warn(
          `Redis error, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        this.isRedisConnected = false;
      }
    }

    this.users.delete(userId);
    this.emailIndex.delete(user.email);
    return true;
  }

  isUsingRedis(): boolean {
    return this.isRedisConnected;
  }

  // For testing purposes
  async clearAllUsers(): Promise<void> {
    if (this.isRedisConnected && this.redisClient) {
      try {
        const userKeys = await this.redisClient.keys(`${this.keyPrefix}user:*`);
        if (userKeys.length > 0) {
          await this.redisClient.del(...userKeys);
        }
      } catch (error) {
        this.logger.warn(`Failed to clear Redis users: ${error}`);
      }
    }
    this.users.clear();
    this.emailIndex.clear();
  }
}
