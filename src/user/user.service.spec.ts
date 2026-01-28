import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserService } from './user.service';
import { CacheService } from '@/cache/cache.service';
import { User as UserSchema, UserDocument } from '@/database/schemas/user.schema';
import * as bcrypt from 'bcrypt';

describe('UserService', () => {
  let service: UserService;
  let userModel: Model<UserDocument>;
  let cacheService: CacheService;

  // In-memory store for mock database
  const mockUsers = new Map<string, any>();

  // Mock document factory
  const createMockDocument = (data: any) => {
    const _id = data._id || new Types.ObjectId();
    const now = new Date();
    const doc = {
      _id,
      email: data.email,
      passwordHash: data.passwordHash,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
      save: jest.fn(),
      toObject: jest.fn(),
    };
    // Set up save to return the document
    doc.save.mockImplementation(async () => {
      const savedDoc = {
        _id: doc._id,
        email: doc.email,
        passwordHash: doc.passwordHash,
        createdAt: doc.createdAt,
        updatedAt: new Date(),
      };
      mockUsers.set(doc._id.toString(), savedDoc);
      return savedDoc;
    });
    doc.toObject.mockReturnValue(doc);
    return doc;
  };

  // Mock model constructor
  const mockUserModel = function(data: any) {
    return createMockDocument(data);
  } as unknown as Model<UserDocument>;

  // Add static methods
  (mockUserModel as any).findById = jest.fn().mockImplementation((id: string) => {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    const user = mockUsers.get(id);
    return Promise.resolve(user ? createMockDocument(user) : null);
  });

  (mockUserModel as any).findOne = jest.fn().mockImplementation((query: any) => {
    if (query.email) {
      for (const user of mockUsers.values()) {
        if (user.email === query.email) {
          return Promise.resolve(createMockDocument(user));
        }
      }
    }
    return Promise.resolve(null);
  });

  (mockUserModel as any).deleteOne = jest.fn().mockImplementation((query: any) => {
    if (query._id) {
      mockUsers.delete(query._id.toString());
    }
    return Promise.resolve({ deletedCount: 1 });
  });

  (mockUserModel as any).deleteMany = jest.fn().mockImplementation(() => {
    mockUsers.clear();
    return Promise.resolve({ deletedCount: mockUsers.size });
  });

  const mockCacheService = {
    isEnabled: jest.fn().mockReturnValue(true),
    getUser: jest.fn().mockReturnValue(undefined),
    getUserIdByEmail: jest.fn().mockReturnValue(undefined),
    setUser: jest.fn(),
    invalidateUser: jest.fn(),
    invalidateAllTokensForUser: jest.fn(),
    clearAll: jest.fn(),
  };

  beforeEach(async () => {
    mockUsers.clear();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getModelToken(UserSchema.name),
          useValue: mockUserModel,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              const config: Record<string, unknown> = {
                BCRYPT_ROUNDS: 4, // Very low for faster tests
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    userModel = module.get<Model<UserDocument>>(getModelToken(UserSchema.name));
    cacheService = module.get<CacheService>(CacheService);
  });

  afterEach(async () => {
    mockUsers.clear();
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

    it('should populate cache after creating user', async () => {
      await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      expect(mockCacheService.setUser).toHaveBeenCalled();
    });
  });

  describe('findById', () => {
    it('should find user by id', async () => {
      const created = await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      // Clear cache mock to test database lookup
      mockCacheService.getUser.mockReturnValue(undefined);

      const found = await service.findById(created.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.email).toBe(created.email);
    });

    it('should return null if user not found', async () => {
      const validObjectId = new Types.ObjectId().toString();
      const found = await service.findById(validObjectId);

      expect(found).toBeNull();
    });

    it('should return null for invalid ObjectId format', async () => {
      const found = await service.findById('invalid-id');

      expect(found).toBeNull();
    });

    it('should return cached user if available', async () => {
      const cachedUser = {
        id: new Types.ObjectId().toString(),
        email: 'cached@example.com',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCacheService.getUser.mockReturnValueOnce(cachedUser);

      const found = await service.findById(cachedUser.id);

      expect(found).toBeDefined();
      expect(found?.email).toBe('cached@example.com');
      expect(userModel.findById).not.toHaveBeenCalled();
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      const created = await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      // Clear cache mock
      mockCacheService.getUserIdByEmail.mockReturnValue(undefined);
      mockCacheService.getUser.mockReturnValue(undefined);

      const found = await service.findByEmail('test@example.com');

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should find user with case-insensitive email', async () => {
      const created = await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      mockCacheService.getUserIdByEmail.mockReturnValue(undefined);
      mockCacheService.getUser.mockReturnValue(undefined);

      const found = await service.findByEmail('TEST@EXAMPLE.COM');

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
    });

    it('should return null if email not found', async () => {
      const found = await service.findByEmail('nonexistent@example.com');

      expect(found).toBeNull();
    });

    it('should use cached userId when available', async () => {
      const created = await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      // Set up cache to return the userId
      mockCacheService.getUserIdByEmail.mockReturnValueOnce(created.id);
      mockCacheService.getUser.mockReturnValueOnce({
        id: created.id,
        email: 'test@example.com',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const found = await service.findByEmail('test@example.com');

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
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

      mockCacheService.getUser.mockReturnValue(undefined);
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
      const validObjectId = new Types.ObjectId().toString();
      await expect(
        service.updatePassword(validObjectId, 'NewPassword456'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for invalid ObjectId', async () => {
      await expect(
        service.updatePassword('invalid-id', 'NewPassword456'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should invalidate cache and tokens after password update', async () => {
      const user = await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      jest.clearAllMocks();
      await service.updatePassword(user.id, 'NewPassword456');

      expect(mockCacheService.invalidateUser).toHaveBeenCalledWith(user.id, user.email);
      expect(mockCacheService.invalidateAllTokensForUser).toHaveBeenCalledWith(user.id);
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

      mockCacheService.getUser.mockReturnValue(undefined);
      expect(await service.findById(user.id)).toBeNull();
    });

    it('should return false for non-existent user', async () => {
      const validObjectId = new Types.ObjectId().toString();
      const result = await service.deleteUser(validObjectId);

      expect(result).toBe(false);
    });

    it('should return false for invalid ObjectId', async () => {
      const result = await service.deleteUser('invalid-id');

      expect(result).toBe(false);
    });

    it('should invalidate cache and tokens when deleting user', async () => {
      const user = await service.create({
        email: 'test@example.com',
        password: 'Password123',
      });

      jest.clearAllMocks();
      await service.deleteUser(user.id);

      expect(mockCacheService.invalidateUser).toHaveBeenCalledWith(user.id, user.email);
      expect(mockCacheService.invalidateAllTokensForUser).toHaveBeenCalledWith(user.id);
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

  describe('isUsingMongoDB', () => {
    it('should return true', () => {
      expect(service.isUsingMongoDB()).toBe(true);
    });
  });

  describe('isUsingRedis', () => {
    it('should return false (MongoDB is now used instead)', () => {
      expect(service.isUsingRedis()).toBe(false);
    });
  });

  describe('clearAllUsers', () => {
    it('should clear all users and cache', async () => {
      await service.create({
        email: 'test1@example.com',
        password: 'Password123',
      });
      await service.create({
        email: 'test2@example.com',
        password: 'Password123',
      });

      await service.clearAllUsers();

      expect(mockCacheService.clearAll).toHaveBeenCalled();
      expect(userModel.deleteMany).toHaveBeenCalledWith({});
    });
  });
});
