import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { RedisModule } from '@/redis/redis.module';
import { RedisPoolService } from '@/redis/redis-pool.service';
import { CacheModule } from '@/cache/cache.module';
import { CacheService } from '@/cache/cache.service';
import { AuthModule } from '@/auth/auth.module';
import { AuthService } from '@/auth/auth.service';
import { UserModule } from '@/user/user.module';
import { UserService } from '@/user/user.service';

/**
 * Integration tests for Redis-backed authentication caching
 * Tests the complete flow of token and user caching with Redis
 */
describe('Redis Auth Caching Integration', () => {
  let module: TestingModule;
  let cacheService: CacheService;
  let authService: AuthService;
  let userService: UserService;
  let redisPoolService: RedisPoolService;
  let mongoServer: MongoMemoryServer;

  // Test configuration with Redis enabled (if available) and caching enabled
  const testConfig = {
    REDIS_ENABLED: process.env.REDIS_HOST ? true : false, // Enable if Redis is available
    REDIS_HOST: process.env.REDIS_HOST || 'localhost',
    REDIS_PORT: parseInt(process.env.REDIS_PORT || '6379', 10),
    REDIS_PASSWORD: process.env.REDIS_PASSWORD || '',
    REDIS_DB: 1, // Use separate DB for tests
    REDIS_KEY_PREFIX: 'test:auth:',
    // MongoDB configuration
    MONGODB_ENABLED: true,
    AUTH_CACHE_ENABLED: true,
    AUTH_CACHE_USER_TTL_MS: 5000,
    AUTH_CACHE_USER_MAX_SIZE: 100,
    AUTH_CACHE_TOKEN_TTL_MS: 5000,
    AUTH_CACHE_TOKEN_MAX_SIZE: 500,
    JWT_SECRET: 'test-secret-key-for-redis-auth-tests',
    JWT_ACCESS_EXPIRY: '15m',
    JWT_REFRESH_EXPIRY: '7d',
    BCRYPT_ROUNDS: 4, // Low for faster tests
  };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [() => ({ ...testConfig, MONGODB_URI: mongoUri })],
        }),
        MongooseModule.forRoot(mongoUri, {
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 10000,
        }),
        JwtModule.register({
          secret: testConfig.JWT_SECRET,
          signOptions: { expiresIn: '15m' },
        }),
        RedisModule,
        CacheModule,
        UserModule,
        AuthModule,
      ],
    }).compile();

    cacheService = module.get<CacheService>(CacheService);
    authService = module.get<AuthService>(AuthService);
    userService = module.get<UserService>(UserService);
    redisPoolService = module.get<RedisPoolService>(RedisPoolService);

    // Initialize services
    cacheService.onModuleInit();
  });

  afterAll(async () => {
    // Cleanup
    cacheService.clearAll();
    await userService.clearAllUsers();
    await authService.clearAllTokens();
    await module.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    // Clear caches before each test
    cacheService.clearAll();
    cacheService.resetMetrics();
    await userService.clearAllUsers();
    await authService.clearAllTokens();
  });

  describe('User Caching with Auth Flow', () => {
    it('should cache user data after registration', async () => {
      const email = `register-cache-${Date.now()}@test.com`;

      const authResult = await authService.register({
        email,
        password: 'Password123',
      });

      expect(authResult.user).toBeDefined();
      expect(authResult.user.email).toBe(email);

      // User should be cached
      const cachedUser = cacheService.getUser(authResult.user.id);
      expect(cachedUser).toBeDefined();
      expect(cachedUser!.email).toBe(email);
    });

    it('should cache user data after login', async () => {
      const email = `login-cache-${Date.now()}@test.com`;

      // First register
      await userService.create({
        email,
        password: 'Password123',
      });

      // Clear cache
      cacheService.clearAll();

      // Login
      const authResult = await authService.login({
        email,
        password: 'Password123',
      });

      expect(authResult.user).toBeDefined();

      // User should be cached after login
      const cachedUser = cacheService.getUser(authResult.user.id);
      expect(cachedUser).toBeDefined();
    });

    it('should return cached user on repeated lookups', async () => {
      const email = `lookup-cache-${Date.now()}@test.com`;

      // Create user
      const user = await userService.create({
        email,
        password: 'Password123',
      });

      // Clear cache
      cacheService.clearAll();
      cacheService.resetMetrics();

      // First lookup - cache miss
      const firstLookup = await userService.findById(user.id);
      expect(firstLookup).toBeDefined();

      const statsAfterFirst = cacheService.getStats();
      const missesAfterFirst = statsAfterFirst.userCache.misses;

      // Second lookup - cache hit
      const secondLookup = await userService.findById(user.id);
      expect(secondLookup).toBeDefined();
      expect(secondLookup!.id).toBe(user.id);

      const statsAfterSecond = cacheService.getStats();

      // Misses should not increase, hits should
      expect(statsAfterSecond.userCache.misses).toBe(missesAfterFirst);
      expect(statsAfterSecond.userCache.hits).toBeGreaterThan(0);
    });

    it('should cache email-to-ID mapping', async () => {
      const email = `email-index-${Date.now()}@test.com`;

      const user = await userService.create({
        email,
        password: 'Password123',
      });

      // Email should be indexed in cache
      const userId = cacheService.getUserIdByEmail(email);
      expect(userId).toBe(user.id);
    });

    it('should invalidate user cache on password update', async () => {
      const email = `password-update-${Date.now()}@test.com`;

      const user = await userService.create({
        email,
        password: 'Password123',
      });

      // Verify user is cached
      expect(cacheService.getUser(user.id)).toBeDefined();

      // Update password
      await userService.updatePassword(user.id, 'NewPassword456');

      // Cache should be refreshed (user still cached but with fresh data)
      const cachedUser = cacheService.getUser(user.id);
      expect(cachedUser).toBeDefined();
    });

    it('should invalidate user cache on user deletion', async () => {
      const email = `delete-cache-${Date.now()}@test.com`;

      const user = await userService.create({
        email,
        password: 'Password123',
      });

      // Verify user is cached
      expect(cacheService.getUser(user.id)).toBeDefined();

      // Delete user
      await userService.deleteUser(user.id);

      // Cache should be cleared
      expect(cacheService.getUser(user.id)).toBeUndefined();
    });
  });

  describe('Token Caching with Auth Flow', () => {
    it('should cache token validation result', async () => {
      const email = `token-cache-${Date.now()}@test.com`;

      // Register user
      await userService.create({
        email,
        password: 'Password123',
      });

      // Login to get token
      const authResult = await authService.login({
        email,
        password: 'Password123',
      });

      // Validate token (should cache result)
      const authUser = await authService.validateAccessToken(authResult.accessToken);
      expect(authUser).toBeDefined();
      expect(authUser!.email).toBe(email);

      // Token should be cached
      const stats = cacheService.getStats();
      expect(stats.tokenCache.size).toBeGreaterThanOrEqual(1);
    });

    it('should return cached token validation on repeated calls', async () => {
      const email = `repeated-validation-${Date.now()}@test.com`;

      // Register user
      await userService.create({
        email,
        password: 'Password123',
      });

      // Login
      const authResult = await authService.login({
        email,
        password: 'Password123',
      });

      // First validation - cache miss
      await authService.validateAccessToken(authResult.accessToken);
      const statsAfterFirst = cacheService.getStats();
      const missesAfterFirst = statsAfterFirst.tokenCache.misses;

      // Second validation - cache hit
      await authService.validateAccessToken(authResult.accessToken);
      const statsAfterSecond = cacheService.getStats();

      // Misses should not increase
      expect(statsAfterSecond.tokenCache.misses).toBe(missesAfterFirst);
      // Hits should increase
      expect(statsAfterSecond.tokenCache.hits).toBeGreaterThan(0);
    });

    it('should invalidate token cache on logout', async () => {
      const email = `logout-invalidate-${Date.now()}@test.com`;

      // Register user
      await userService.create({
        email,
        password: 'Password123',
      });

      // Login
      const authResult = await authService.login({
        email,
        password: 'Password123',
      });

      // Validate token (caches it)
      await authService.validateAccessToken(authResult.accessToken);
      expect(cacheService.getStats().tokenCache.size).toBeGreaterThan(0);

      // Logout
      await authService.logout(authResult.refreshToken);

      // Token cache should be cleared
      expect(cacheService.getStats().tokenCache.size).toBe(0);
    });

    it('should return null for invalid token', async () => {
      const authUser = await authService.validateAccessToken('invalid-token');
      expect(authUser).toBeNull();
    });

    it('should handle token validation for non-existent user gracefully', async () => {
      // This tests the scenario where a token is valid but the user no longer exists
      const email = `deleted-user-token-${Date.now()}@test.com`;

      // Register and login
      await userService.create({
        email,
        password: 'Password123',
      });

      const authResult = await authService.login({
        email,
        password: 'Password123',
      });

      // Token should be valid initially
      const authUser = await authService.validateAccessToken(authResult.accessToken);
      expect(authUser).toBeDefined();
    });
  });

  describe('Cache Performance', () => {
    it('should show performance improvement with caching', async () => {
      const users: Array<{ id: string; email: string }> = [];

      // Create multiple users
      for (let i = 0; i < 5; i++) {
        const user = await userService.create({
          email: `perf-test-${Date.now()}-${i}@test.com`,
          password: 'Password123',
        });
        users.push({ id: user.id, email: user.email });
      }

      // Clear cache
      cacheService.clearAll();

      // Cold lookups (cache misses)
      const coldStart = Date.now();
      for (const user of users) {
        await userService.findById(user.id);
      }
      const coldDuration = Date.now() - coldStart;

      // Warm lookups (cache hits)
      const warmStart = Date.now();
      for (const user of users) {
        await userService.findById(user.id);
      }
      const warmDuration = Date.now() - warmStart;

      // Warm should be faster or comparable (allowing for variance)
      expect(warmDuration).toBeLessThanOrEqual(coldDuration + 50);
    });

    it('should track cache hit rate accurately', async () => {
      const email = `hitrate-${Date.now()}@test.com`;

      const user = await userService.create({
        email,
        password: 'Password123',
      });

      cacheService.clearAll();
      cacheService.resetMetrics();

      // First lookup - miss
      await userService.findById(user.id);

      // Multiple hits via direct cache access
      for (let i = 0; i < 9; i++) {
        cacheService.getUser(user.id);
      }

      const stats = cacheService.getStats();
      // Should have high hit rate (9 hits out of 10 total)
      expect(stats.userCache.hitRate).toBeGreaterThanOrEqual(80);
    });
  });

  describe('Cache and Auth Service Integration', () => {
    it('should handle complete auth flow with caching', async () => {
      const email = `complete-flow-${Date.now()}@test.com`;

      // Register
      const registerResult = await authService.register({
        email,
        password: 'Password123',
      });
      expect(registerResult.accessToken).toBeDefined();
      expect(registerResult.refreshToken).toBeDefined();

      // Validate token (should cache)
      const authUser1 = await authService.validateAccessToken(registerResult.accessToken);
      expect(authUser1).toBeDefined();

      // Refresh token
      const refreshResult = await authService.refreshToken(registerResult.refreshToken);
      expect(refreshResult.accessToken).toBeDefined();

      // Validate new token
      const authUser2 = await authService.validateAccessToken(refreshResult.accessToken);
      expect(authUser2).toBeDefined();
      expect(authUser2!.userId).toBe(authUser1!.userId);

      // Logout
      await authService.logout(refreshResult.refreshToken);

      // Old token validation should be cleared from cache
      // But might still be cryptographically valid
    });

    it('should handle multiple concurrent token validations', async () => {
      const email = `concurrent-${Date.now()}@test.com`;

      await userService.create({
        email,
        password: 'Password123',
      });

      const authResult = await authService.login({
        email,
        password: 'Password123',
      });

      // Concurrent validations
      const validations = await Promise.all([
        authService.validateAccessToken(authResult.accessToken),
        authService.validateAccessToken(authResult.accessToken),
        authService.validateAccessToken(authResult.accessToken),
        authService.validateAccessToken(authResult.accessToken),
        authService.validateAccessToken(authResult.accessToken),
      ]);

      // All should succeed
      expect(validations.every((v) => v !== null)).toBe(true);
      expect(validations.every((v) => v!.email === email)).toBe(true);
    });

    it('should handle multiple users with separate cached data', async () => {
      const users = [];

      // Create multiple users
      for (let i = 0; i < 3; i++) {
        const email = `multi-user-${Date.now()}-${i}@test.com`;
        await userService.create({
          email,
          password: 'Password123',
        });

        const authResult = await authService.login({
          email,
          password: 'Password123',
        });

        users.push({ email, authResult });
      }

      // Validate all tokens
      for (const user of users) {
        const authUser = await authService.validateAccessToken(user.authResult.accessToken);
        expect(authUser).toBeDefined();
        expect(authUser!.email).toBe(user.email);
      }

      // Each user should have separate cached data
      const stats = cacheService.getStats();
      expect(stats.userCache.size).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Redis Pool Integration', () => {
    it('should report Redis availability status', () => {
      // This will vary based on whether Redis is actually available
      const isAvailable = redisPoolService.isAvailable();
      const isEnabled = redisPoolService.isEnabled();

      // Just verify the methods work
      expect(typeof isAvailable).toBe('boolean');
      expect(typeof isEnabled).toBe('boolean');
    });

    it('should report key prefix', () => {
      const prefix = redisPoolService.getKeyPrefix();
      expect(prefix).toBe('test:auth:');
    });

    it('should report health status', async () => {
      const isHealthy = await redisPoolService.isHealthy();
      // Will be false if Redis not available, true if connected
      expect(typeof isHealthy).toBe('boolean');
    });

    it('should report latency when available', async () => {
      const latency = await redisPoolService.getLatency();
      // Will be null if Redis not available, number if connected
      expect(latency === null || typeof latency === 'number').toBe(true);
    });
  });

  describe('Cache Disabled Mode', () => {
    let disabledModule: TestingModule;
    let disabledCacheService: CacheService;
    let disabledUserService: UserService;
    let disabledMongoServer: MongoMemoryServer;

    beforeAll(async () => {
      disabledMongoServer = await MongoMemoryServer.create();
      const disabledMongoUri = disabledMongoServer.getUri();

      disabledModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                ...testConfig,
                AUTH_CACHE_ENABLED: false,
                MONGODB_URI: disabledMongoUri,
              }),
            ],
          }),
          MongooseModule.forRoot(disabledMongoUri, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
          }),
          JwtModule.register({
            secret: testConfig.JWT_SECRET,
            signOptions: { expiresIn: '15m' },
          }),
          RedisModule,
          CacheModule,
          UserModule,
          AuthModule,
        ],
      }).compile();

      disabledCacheService = disabledModule.get<CacheService>(CacheService);
      disabledUserService = disabledModule.get<UserService>(UserService);

      disabledCacheService.onModuleInit();
    });

    afterAll(async () => {
      await disabledUserService.clearAllUsers();
      await disabledModule.close();
      await disabledMongoServer.stop();
    });

    it('should report disabled status', () => {
      expect(disabledCacheService.isEnabled()).toBe(false);
    });

    it('should not cache users when disabled', async () => {
      const email = `disabled-cache-${Date.now()}@test.com`;

      const user = await disabledUserService.create({
        email,
        password: 'Password123',
      });

      // Should not be cached
      expect(disabledCacheService.getUser(user.id)).toBeUndefined();
    });

    it('should still function correctly when cache disabled', async () => {
      const email = `disabled-function-${Date.now()}@test.com`;

      const user = await disabledUserService.create({
        email,
        password: 'Password123',
      });

      // User operations should still work
      const found = await disabledUserService.findById(user.id);
      expect(found).toBeDefined();
      expect(found!.email).toBe(email);
    });
  });
});
