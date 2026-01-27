import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { User } from './user.entity';
import { IUser, ICreateUser } from './interfaces/user.interface';
import { CacheService } from '@/cache/cache.service';
import { RedisPoolService } from '@/redis/redis-pool.service';
import { toCachedUser } from '@/cache/interfaces/cache.interface';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly users = new Map<string, IUser>();
  private readonly emailIndex = new Map<string, string>(); // email -> id
  private readonly keyPrefix: string;
  private readonly bcryptRounds: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly redisPool: RedisPoolService,
  ) {
    this.keyPrefix = this.configService.get<string>(
      'REDIS_KEY_PREFIX',
      'talksy:',
    );
    this.bcryptRounds = this.configService.get<number>('BCRYPT_ROUNDS', 12);

    if (!this.redisPool.isEnabled()) {
      this.logger.warn(
        'Redis disabled, using in-memory user storage. ' +
        'WARNING: User data will NOT persist across restarts and will NOT be shared across instances. ' +
        'This mode is ONLY suitable for development/testing with a single instance.'
      );
    }
  }

  /**
   * Check if Redis is available for use
   */
  private isRedisAvailable(): boolean {
    return this.redisPool.isAvailable();
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

    const client = this.redisPool.getClient();
    if (client) {
      try {
        await client.set(this.getUserKey(user.id), this.serializeUser(user));
        await client.set(this.getEmailIndexKey(email), user.id);
        this.logger.debug(`User ${user.id} created in Redis`);
      } catch (error) {
        this.logger.warn(
          `Redis error, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        this.users.set(user.id, user);
        this.emailIndex.set(email, user.id);
      }
    } else {
      this.users.set(user.id, user);
      this.emailIndex.set(email, user.id);
    }

    // Populate cache with new user
    this.cacheService.setUser(toCachedUser(user));

    return new User(user);
  }

  async findById(id: string): Promise<User | null> {
    // Check cache first
    const cached = this.cacheService.getUser(id);
    if (cached) {
      this.logger.debug(`User ${id} found in cache`);
      return new User(cached);
    }

    // Cache miss - fetch from storage
    let user: IUser | null = null;
    const client = this.redisPool.getClient();

    if (client) {
      try {
        const data = await client.get(this.getUserKey(id));
        if (data) {
          user = this.deserializeUser(data);
        }
      } catch (error) {
        this.logger.warn(
          `Redis error, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    // Fallback to in-memory if Redis not available or failed
    if (!user && !this.isRedisAvailable()) {
      user = this.users.get(id) || null;
    }

    // Populate cache if found
    if (user) {
      this.cacheService.setUser(toCachedUser(user));
      return new User(user);
    }

    return null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const normalizedEmail = email.toLowerCase();

    // Check email->id cache first
    const cachedUserId = this.cacheService.getUserIdByEmail(normalizedEmail);
    if (cachedUserId) {
      this.logger.debug(`Email ${normalizedEmail} found in cache, userId: ${cachedUserId}`);
      return this.findById(cachedUserId);
    }

    // Cache miss - fetch from storage
    const client = this.redisPool.getClient();
    if (client) {
      try {
        const userId = await client.get(this.getEmailIndexKey(normalizedEmail));
        if (!userId) return null;
        return this.findById(userId);
      } catch (error) {
        this.logger.warn(
          `Redis error, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
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

    const client = this.redisPool.getClient();
    if (client) {
      try {
        await client.set(
          this.getUserKey(userId),
          this.serializeUser(updatedUser),
        );
      } catch (error) {
        this.logger.warn(
          `Redis error, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
        this.users.set(userId, updatedUser);
      }
    } else {
      this.users.set(userId, updatedUser);
    }

    // Invalidate and refresh cache (password changed = security event)
    this.cacheService.invalidateUser(userId, user.email);
    this.cacheService.setUser(toCachedUser(updatedUser));
    // Also invalidate all tokens for this user (password change should invalidate sessions)
    this.cacheService.invalidateAllTokensForUser(userId);
  }

  async deleteUser(userId: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user) return false;

    // Invalidate cache first
    this.cacheService.invalidateUser(userId, user.email);
    this.cacheService.invalidateAllTokensForUser(userId);

    const client = this.redisPool.getClient();
    if (client) {
      try {
        await client.del(this.getUserKey(userId));
        await client.del(this.getEmailIndexKey(user.email));
        return true;
      } catch (error) {
        this.logger.warn(
          `Redis error, falling back to in-memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    this.users.delete(userId);
    this.emailIndex.delete(user.email);
    return true;
  }

  isUsingRedis(): boolean {
    return this.isRedisAvailable();
  }

  // For testing purposes
  async clearAllUsers(): Promise<void> {
    // Clear cache first
    this.cacheService.clearAll();

    const client = this.redisPool.getClient();
    if (client) {
      try {
        const userKeys = await client.keys(`${this.keyPrefix}user:*`);
        if (userKeys.length > 0) {
          await client.del(...userKeys);
        }
      } catch (error) {
        this.logger.warn(`Failed to clear Redis users: ${error}`);
      }
    }
    this.users.clear();
    this.emailIndex.clear();
  }
}
