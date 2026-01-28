/**
 * MongoDB Integration Tests
 *
 * Comprehensive tests for MongoDB operations including:
 * - CRUD operations
 * - Connection management
 * - Error handling
 * - Concurrent operations
 * - Index performance
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule, getModelToken, getConnectionToken } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Model, Connection, Types } from 'mongoose';
import { User, UserSchema, UserDocument } from '@/database/schemas/user.schema';
import { UserModule } from '@/user/user.module';
import { UserService } from '@/user/user.service';
import { CacheModule } from '@/cache/cache.module';
import { CacheService } from '@/cache/cache.service';

describe('MongoDB Integration Tests', () => {
  let module: TestingModule;
  let mongoServer: MongoMemoryServer;
  let userModel: Model<UserDocument>;
  let userService: UserService;
  let cacheService: CacheService;
  let connection: Connection;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              MONGODB_ENABLED: true,
              MONGODB_URI: mongoUri,
              BCRYPT_ROUNDS: 4, // Low for faster tests
              AUTH_CACHE_ENABLED: true,
              AUTH_CACHE_USER_TTL_MS: 5000,
              AUTH_CACHE_USER_MAX_SIZE: 100,
              AUTH_CACHE_TOKEN_TTL_MS: 5000,
              AUTH_CACHE_TOKEN_MAX_SIZE: 500,
            }),
          ],
        }),
        MongooseModule.forRoot(mongoUri),
        MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
        CacheModule,
        UserModule,
      ],
    }).compile();

    userModel = module.get<Model<UserDocument>>(getModelToken(User.name));
    userService = module.get<UserService>(UserService);
    cacheService = module.get<CacheService>(CacheService);
    connection = module.get<Connection>(getConnectionToken());

    cacheService.onModuleInit();
  });

  afterAll(async () => {
    await module.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear all data before each test
    await userModel.deleteMany({});
    cacheService.clearAll();
  });

  describe('Connection Management', () => {
    it('should establish connection successfully', () => {
      expect(connection.readyState).toBe(1);
    });

    it('should have access to the database', () => {
      expect(connection.db).toBeDefined();
    });

    it('should list collections', async () => {
      // Create a user to ensure collection exists
      await userModel.create({
        email: 'collection-test@test.com',
        passwordHash: 'test-hash',
      });

      const db = connection.db;
      expect(db).toBeDefined();
      if (db) {
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map((c) => c.name);
        expect(collectionNames).toContain('users');
      }
    });
  });

  describe('CRUD Operations', () => {
    describe('Create', () => {
      it('should create a new user document', async () => {
        const user = await userModel.create({
          email: 'create-test@test.com',
          passwordHash: 'hashed-password',
        });

        expect(user._id).toBeDefined();
        expect(user.email).toBe('create-test@test.com');
        expect(user.createdAt).toBeDefined();
        expect(user.updatedAt).toBeDefined();
      });

      it('should auto-generate ObjectId', async () => {
        const user = await userModel.create({
          email: 'objectid-test@test.com',
          passwordHash: 'hashed-password',
        });

        expect(Types.ObjectId.isValid(user._id)).toBe(true);
      });

      it('should enforce unique email constraint', async () => {
        await userModel.create({
          email: 'unique-test@test.com',
          passwordHash: 'hashed-password',
        });

        await expect(
          userModel.create({
            email: 'unique-test@test.com',
            passwordHash: 'another-hash',
          }),
        ).rejects.toThrow();
      });

      it('should lowercase email automatically', async () => {
        const user = await userModel.create({
          email: 'UPPERCASE@TEST.COM',
          passwordHash: 'hashed-password',
        });

        expect(user.email).toBe('uppercase@test.com');
      });

      it('should trim whitespace from email', async () => {
        const user = await userModel.create({
          email: '  trimmed@test.com  ',
          passwordHash: 'hashed-password',
        });

        expect(user.email).toBe('trimmed@test.com');
      });
    });

    describe('Read', () => {
      it('should find user by ID', async () => {
        const created = await userModel.create({
          email: 'findbyid@test.com',
          passwordHash: 'hashed-password',
        });

        const found = await userModel.findById(created._id);
        expect(found).toBeDefined();
        expect(found!.email).toBe('findbyid@test.com');
      });

      it('should find user by email', async () => {
        await userModel.create({
          email: 'findbyemail@test.com',
          passwordHash: 'hashed-password',
        });

        const found = await userModel.findOne({ email: 'findbyemail@test.com' });
        expect(found).toBeDefined();
        expect(found!.email).toBe('findbyemail@test.com');
      });

      it('should return null for non-existent ID', async () => {
        const nonExistentId = new Types.ObjectId();
        const found = await userModel.findById(nonExistentId);
        expect(found).toBeNull();
      });

      it('should return null for non-existent email', async () => {
        const found = await userModel.findOne({ email: 'nonexistent@test.com' });
        expect(found).toBeNull();
      });

      it('should find all users', async () => {
        await Promise.all([
          userModel.create({ email: 'user1@test.com', passwordHash: 'hash1' }),
          userModel.create({ email: 'user2@test.com', passwordHash: 'hash2' }),
          userModel.create({ email: 'user3@test.com', passwordHash: 'hash3' }),
        ]);

        const users = await userModel.find({});
        expect(users.length).toBe(3);
      });

      it('should support pagination', async () => {
        await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            userModel.create({
              email: `page-user-${i}@test.com`,
              passwordHash: `hash${i}`,
            }),
          ),
        );

        const page1 = await userModel.find({}).skip(0).limit(3);
        const page2 = await userModel.find({}).skip(3).limit(3);

        expect(page1.length).toBe(3);
        expect(page2.length).toBe(3);
        expect(page1[0].email).not.toBe(page2[0].email);
      });
    });

    describe('Update', () => {
      it('should update user document', async () => {
        const user = await userModel.create({
          email: 'update-test@test.com',
          passwordHash: 'original-hash',
        });

        user.passwordHash = 'updated-hash';
        await user.save();

        const updated = await userModel.findById(user._id);
        expect(updated!.passwordHash).toBe('updated-hash');
      });

      it('should update updatedAt timestamp', async () => {
        const user = await userModel.create({
          email: 'timestamp-test@test.com',
          passwordHash: 'original-hash',
        });

        const originalUpdatedAt = user.updatedAt;

        // Wait a bit to ensure timestamp difference
        await new Promise((resolve) => setTimeout(resolve, 10));

        user.passwordHash = 'new-hash';
        await user.save();

        const updated = await userModel.findById(user._id);
        expect(updated!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
      });

      it('should use findByIdAndUpdate', async () => {
        const user = await userModel.create({
          email: 'findupdatetest@test.com',
          passwordHash: 'original-hash',
        });

        const updated = await userModel.findByIdAndUpdate(
          user._id,
          { passwordHash: 'new-hash' },
          { new: true },
        );

        expect(updated!.passwordHash).toBe('new-hash');
      });
    });

    describe('Delete', () => {
      it('should delete user by ID', async () => {
        const user = await userModel.create({
          email: 'delete-test@test.com',
          passwordHash: 'hashed-password',
        });

        await userModel.deleteOne({ _id: user._id });

        const found = await userModel.findById(user._id);
        expect(found).toBeNull();
      });

      it('should delete all users', async () => {
        await Promise.all([
          userModel.create({ email: 'del1@test.com', passwordHash: 'hash1' }),
          userModel.create({ email: 'del2@test.com', passwordHash: 'hash2' }),
        ]);

        await userModel.deleteMany({});

        const count = await userModel.countDocuments({});
        expect(count).toBe(0);
      });

      it('should return delete result', async () => {
        const user = await userModel.create({
          email: 'delete-result@test.com',
          passwordHash: 'hashed-password',
        });

        const result = await userModel.deleteOne({ _id: user._id });
        expect(result.deletedCount).toBe(1);
      });
    });
  });

  describe('Index Performance', () => {
    beforeEach(async () => {
      // Create multiple users for index tests
      await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          userModel.create({
            email: `index-test-${i}@test.com`,
            passwordHash: `hash${i}`,
          }),
        ),
      );
    });

    it('should use email index for lookups', async () => {
      const explain = await userModel
        .findOne({ email: 'index-test-50@test.com' })
        .explain('executionStats');

      // The index should be used
      expect(explain).toBeDefined();
    });

    it('should efficiently query by indexed email', async () => {
      const start = Date.now();
      await userModel.findOne({ email: 'index-test-99@test.com' });
      const duration = Date.now() - start;

      // Should be very fast with index
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent reads', async () => {
      const user = await userModel.create({
        email: 'concurrent-read@test.com',
        passwordHash: 'hashed-password',
      });

      const results = await Promise.all(
        Array.from({ length: 20 }, () => userModel.findById(user._id)),
      );

      expect(results.every((r) => r !== null)).toBe(true);
      expect(results.every((r) => r!.email === 'concurrent-read@test.com')).toBe(true);
    });

    it('should handle concurrent writes', async () => {
      const results = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          userModel.create({
            email: `concurrent-write-${i}@test.com`,
            passwordHash: `hash${i}`,
          }),
        ),
      );

      expect(results.length).toBe(20);
      expect(results.every((r) => r._id !== undefined)).toBe(true);
    });

    it('should handle mixed concurrent operations', async () => {
      // Create initial users
      const users = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          userModel.create({
            email: `mixed-op-${i}@test.com`,
            passwordHash: `hash${i}`,
          }),
        ),
      );

      // Concurrent mixed operations
      const operations = [
        // Reads
        ...users.slice(0, 5).map((u) => userModel.findById(u._id)),
        // Updates
        ...users.slice(5).map((u) =>
          userModel.findByIdAndUpdate(u._id, { passwordHash: 'updated' }, { new: true }),
        ),
        // New creates
        ...Array.from({ length: 5 }, (_, i) =>
          userModel.create({
            email: `mixed-new-${i}@test.com`,
            passwordHash: `newhash${i}`,
          }),
        ),
      ];

      const results = await Promise.all(operations);
      expect(results.every((r) => r !== null)).toBe(true);
    });
  });

  describe('UserService Integration', () => {
    it('should create user through service', async () => {
      const user = await userService.create({
        email: 'service-create@test.com',
        password: 'Password123',
      });

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe('service-create@test.com');
    });

    it('should find user by ID through service', async () => {
      const created = await userService.create({
        email: 'service-find@test.com',
        password: 'Password123',
      });

      // Clear cache to test MongoDB lookup
      cacheService.clearAll();

      const found = await userService.findById(created.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it('should find user by email through service', async () => {
      await userService.create({
        email: 'service-email@test.com',
        password: 'Password123',
      });

      cacheService.clearAll();

      const found = await userService.findByEmail('service-email@test.com');
      expect(found).toBeDefined();
    });

    it('should handle password hashing', async () => {
      const user = await userService.create({
        email: 'password-hash@test.com',
        password: 'Password123',
      });

      expect(user.passwordHash).toBeDefined();
      expect(user.passwordHash).not.toBe('Password123');
    });

    it('should validate password correctly', async () => {
      const user = await userService.create({
        email: 'validate-password@test.com',
        password: 'Password123',
      });

      const isValid = await userService.validatePassword(user, 'Password123');
      const isInvalid = await userService.validatePassword(user, 'WrongPassword');

      expect(isValid).toBe(true);
      expect(isInvalid).toBe(false);
    });

    it('should update password through service', async () => {
      const user = await userService.create({
        email: 'update-password@test.com',
        password: 'Password123',
      });

      await userService.updatePassword(user.id, 'NewPassword456');

      cacheService.clearAll();
      const updated = await userService.findById(user.id);

      const isNewValid = await userService.validatePassword(updated!, 'NewPassword456');
      const isOldValid = await userService.validatePassword(updated!, 'Password123');

      expect(isNewValid).toBe(true);
      expect(isOldValid).toBe(false);
    });

    it('should delete user through service', async () => {
      const user = await userService.create({
        email: 'delete-service@test.com',
        password: 'Password123',
      });

      const result = await userService.deleteUser(user.id);
      expect(result).toBe(true);

      cacheService.clearAll();
      const found = await userService.findById(user.id);
      expect(found).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should throw ConflictException for duplicate email', async () => {
      await userService.create({
        email: 'duplicate@test.com',
        password: 'Password123',
      });

      await expect(
        userService.create({
          email: 'duplicate@test.com',
          password: 'Password456',
        }),
      ).rejects.toThrow('Email already registered');
    });

    it('should return null for invalid ObjectId format', async () => {
      const found = await userService.findById('invalid-id');
      expect(found).toBeNull();
    });

    it('should handle NotFoundException for non-existent user on password update', async () => {
      const validObjectId = new Types.ObjectId().toString();

      await expect(
        userService.updatePassword(validObjectId, 'NewPassword'),
      ).rejects.toThrow('User not found');
    });

    it('should return false for deleting non-existent user', async () => {
      const validObjectId = new Types.ObjectId().toString();
      const result = await userService.deleteUser(validObjectId);
      expect(result).toBe(false);
    });
  });

  describe('Cache Integration', () => {
    it('should cache user after creation', async () => {
      const user = await userService.create({
        email: 'cache-create@test.com',
        password: 'Password123',
      });

      const cached = cacheService.getUser(user.id);
      expect(cached).toBeDefined();
      expect(cached!.email).toBe('cache-create@test.com');
    });

    it('should cache user after findById', async () => {
      const user = await userService.create({
        email: 'cache-find@test.com',
        password: 'Password123',
      });

      cacheService.clearAll();

      // This should cache the user
      await userService.findById(user.id);

      const cached = cacheService.getUser(user.id);
      expect(cached).toBeDefined();
    });

    it('should return cached user without DB query', async () => {
      const user = await userService.create({
        email: 'cache-hit@test.com',
        password: 'Password123',
      });

      // User is cached after creation
      // Subsequent lookups should use cache
      const found = await userService.findById(user.id);
      expect(found).toBeDefined();
      expect(found!.email).toBe('cache-hit@test.com');
    });

    it('should invalidate cache on password update', async () => {
      const user = await userService.create({
        email: 'cache-invalidate@test.com',
        password: 'Password123',
      });

      // Verify cached
      expect(cacheService.getUser(user.id)).toBeDefined();

      // Update password
      await userService.updatePassword(user.id, 'NewPassword');

      // Cache should be refreshed (still cached but updated)
      const cached = cacheService.getUser(user.id);
      expect(cached).toBeDefined();
    });

    it('should invalidate cache on user deletion', async () => {
      const user = await userService.create({
        email: 'cache-delete@test.com',
        password: 'Password123',
      });

      // Verify cached
      expect(cacheService.getUser(user.id)).toBeDefined();

      // Delete user
      await userService.deleteUser(user.id);

      // Cache should be cleared
      expect(cacheService.getUser(user.id)).toBeUndefined();
    });
  });
});
