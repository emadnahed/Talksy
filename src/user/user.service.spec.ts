import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { CacheService } from '@/cache/cache.service';
import { RedisPoolService } from '@/redis/redis-pool.service';
import * as bcrypt from 'bcrypt';

describe('UserService', () => {
  let service: UserService;
  let configService: ConfigService;

  const mockRedisPoolService = {
    isEnabled: jest.fn().mockReturnValue(false),
    isAvailable: jest.fn().mockReturnValue(false),
    getClient: jest.fn().mockReturnValue(null),
    getKeyPrefix: jest.fn().mockReturnValue('talksy:'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              const config: Record<string, unknown> = {
                REDIS_ENABLED: false,
                REDIS_KEY_PREFIX: 'talksy:',
                BCRYPT_ROUNDS: 10, // Lower for faster tests
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: CacheService,
          useValue: {
            isEnabled: jest.fn().mockReturnValue(true),
            getUser: jest.fn().mockReturnValue(undefined),
            getUserIdByEmail: jest.fn().mockReturnValue(undefined),
            setUser: jest.fn(),
            invalidateUser: jest.fn(),
            invalidateAllTokensForUser: jest.fn(),
            clearAll: jest.fn(),
          },
        },
        {
          provide: RedisPoolService,
          useValue: mockRedisPoolService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    await service.clearAllUsers();
  });

  describe('create', () => {
    it('should create a new user with hashed password', async () => {
      const user = await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe('test@example.com');
      expect(user.passwordHash).toBeDefined();
      expect(user.passwordHash).not.toBe('Password123');
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should normalize email to lowercase', async () => {
      const user = await service.create({
        email: 'TEST@EXAMPLE.COM',
        password: 'Password123',
      });

      expect(user.email).toBe('test@example.com');
    });

    it('should throw ConflictException if email already exists', async () => {
      await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      await expect(
        service.create({
          email: 'test@example.com',
          password: 'AnotherPass123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException for case-insensitive email match', async () => {
      await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      await expect(
        service.create({
          email: 'TEST@EXAMPLE.COM',
          password: 'AnotherPass123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findById', () => {
    it('should find user by id', async () => {
      const created = await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      const found = await service.findById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.email).toBe(created.email);
    });

    it('should return null if user not found', async () => {
      const found = await service.findById('non-existent-id');

      expect(found).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      const created = await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      const found = await service.findByEmail('test@example.com');

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should find user with case-insensitive email', async () => {
      const created = await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      const found = await service.findByEmail('TEST@EXAMPLE.COM');

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should return null if email not found', async () => {
      const found = await service.findByEmail('nonexistent@example.com');

      expect(found).toBeNull();
    });
  });

  describe('validatePassword', () => {
    it('should return true for correct password', async () => {
      const user = await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      const isValid = await service.validatePassword(user, 'Password123');

      expect(isValid).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const user = await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      const isValid = await service.validatePassword(user, 'WrongPassword');

      expect(isValid).toBe(false);
    });
  });

  describe('updatePassword', () => {
    it('should update user password', async () => {
      const user = await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      await service.updatePassword(user.id, 'NewPassword456');

      const updatedUser = await service.findById(user.id);
      expect(updatedUser).toBeDefined();

      const isNewPasswordValid = await service.validatePassword(
        updatedUser!,
        'NewPassword456',
      );
      expect(isNewPasswordValid).toBe(true);

      const isOldPasswordValid = await service.validatePassword(
        updatedUser!,
        'Password123',
      );
      expect(isOldPasswordValid).toBe(false);
    });

    it('should throw NotFoundException for non-existent user', async () => {
      await expect(
        service.updatePassword('non-existent-id', 'NewPassword456'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteUser', () => {
    it('should delete user and return true', async () => {
      const user = await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      const result = await service.deleteUser(user.id);

      expect(result).toBe(true);
      expect(await service.findById(user.id)).toBeNull();
      expect(await service.findByEmail('test@example.com')).toBeNull();
    });

    it('should return false for non-existent user', async () => {
      const result = await service.deleteUser('non-existent-id');

      expect(result).toBe(false);
    });
  });

  describe('toPublic', () => {
    it('should return user without password hash', async () => {
      const user = await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      const publicUser = user.toPublic();

      expect(publicUser.id).toBe(user.id);
      expect(publicUser.email).toBe(user.email);
      expect(publicUser.createdAt).toBe(user.createdAt);
      expect((publicUser as unknown as Record<string, unknown>).passwordHash).toBeUndefined();
    });
  });

  describe('isUsingRedis', () => {
    it('should return false when Redis is disabled', () => {
      expect(service.isUsingRedis()).toBe(false);
    });
  });
});
