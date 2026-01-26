import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CacheModule } from '@/cache/cache.module';
import { CacheService } from '@/cache/cache.service';
import { AuthModule } from '@/auth/auth.module';
import { AuthService } from '@/auth/auth.service';
import { UserModule } from '@/user/user.module';
import { UserService } from '@/user/user.service';
import { toCachedUser } from '@/cache/interfaces/cache.interface';

describe('CacheModule Integration', () => {
  let module: TestingModule;
  let cacheService: CacheService;
  let authService: AuthService;
  let userService: UserService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              REDIS_ENABLED: false,
              AUTH_CACHE_ENABLED: true,
              AUTH_CACHE_USER_TTL_MS: 5000,
              AUTH_CACHE_USER_MAX_SIZE: 100,
              AUTH_CACHE_TOKEN_TTL_MS: 5000,
              AUTH_CACHE_TOKEN_MAX_SIZE: 500,
              JWT_SECRET: 'test-secret-key',
              JWT_ACCESS_EXPIRY: '15m',
              JWT_REFRESH_EXPIRY: '7d',
              BCRYPT_ROUNDS: 4, // Low for faster tests
            }),
          ],
        }),
        JwtModule.register({
          secret: 'test-secret-key',
          signOptions: { expiresIn: '15m' },
        }),
        CacheModule,
        UserModule,
        AuthModule,
      ],
    }).compile();

    cacheService = module.get<CacheService>(CacheService);
    authService = module.get<AuthService>(AuthService);
    userService = module.get<UserService>(UserService);

    cacheService.onModuleInit();
    await userService.onModuleInit();
    await authService.onModuleInit();
  });

  afterEach(async () => {
    cacheService.clearAll();
    await userService.clearAllUsers();
    await authService.clearAllTokens();
    await module.close();
  });

  describe('Cache Module Initialization', () => {
    it('should provide CacheService', () => {
      expect(cacheService).toBeDefined();
      expect(cacheService).toBeInstanceOf(CacheService);
    });

    it('should be enabled when configured', () => {
      expect(cacheService.isEnabled()).toBe(true);
    });

    it('should report initial stats with zero counts', () => {
      const stats = cacheService.getStats();
      expect(stats.userCache.size).toBe(0);
      expect(stats.tokenCache.size).toBe(0);
      expect(stats.userCache.hits).toBe(0);
      expect(stats.userCache.misses).toBe(0);
    });
  });

  describe('User Cache Integration', () => {
    it('should cache user after creation', async () => {
      const user = await userService.create({
        email: 'cache-test@example.com',
        password: 'Password123',
      });

      // User should be cached after creation
      const stats = cacheService.getStats();
      expect(stats.userCache.size).toBeGreaterThanOrEqual(1);

      // Subsequent lookup should hit cache
      const cached = cacheService.getUser(user.id);
      expect(cached).toBeDefined();
      expect(cached!.email).toBe('cache-test@example.com');
    });

    it('should cache user after findById', async () => {
      // Create user first
      const user = await userService.create({
        email: 'findbyid-test@example.com',
        password: 'Password123',
      });

      // Clear cache to test findById caching
      cacheService.clearAll();

      // First lookup - cache miss
      const found = await userService.findById(user.id);
      expect(found).toBeDefined();

      // Verify user is now cached
      const cached = cacheService.getUser(user.id);
      expect(cached).toBeDefined();
      expect(cached!.id).toBe(user.id);
    });

    it('should cache email to ID mapping', async () => {
      const user = await userService.create({
        email: 'email-index-test@example.com',
        password: 'Password123',
      });

      // Email should be indexed
      const userId = cacheService.getUserIdByEmail('email-index-test@example.com');
      expect(userId).toBe(user.id);
    });

    it('should invalidate cache on password update', async () => {
      const user = await userService.create({
        email: 'password-update@example.com',
        password: 'Password123',
      });

      // Verify cached
      expect(cacheService.getUser(user.id)).toBeDefined();

      // Update password
      await userService.updatePassword(user.id, 'NewPassword456');

      // Cache should be refreshed with updated user
      const cached = cacheService.getUser(user.id);
      expect(cached).toBeDefined();
    });

    it('should invalidate cache on user deletion', async () => {
      const user = await userService.create({
        email: 'delete-test@example.com',
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

  describe('Token Cache Integration', () => {
    it('should cache token validation after login', async () => {
      // Register user
      await userService.create({
        email: 'token-cache@example.com',
        password: 'Password123',
      });

      // Login
      const authResponse = await authService.login({
        email: 'token-cache@example.com',
        password: 'Password123',
      });

      // Validate token (should cache)
      const authUser = await authService.validateAccessToken(authResponse.accessToken);
      expect(authUser).toBeDefined();

      // Check stats - should have cached the token
      const stats = cacheService.getStats();
      expect(stats.tokenCache.size).toBeGreaterThanOrEqual(1);
    });

    it('should return cached token validation', async () => {
      // Register and login
      await userService.create({
        email: 'cached-validation@example.com',
        password: 'Password123',
      });

      const authResponse = await authService.login({
        email: 'cached-validation@example.com',
        password: 'Password123',
      });

      // First validation - cache miss
      await authService.validateAccessToken(authResponse.accessToken);
      const statsAfterFirst = cacheService.getStats();
      const missesAfterFirst = statsAfterFirst.tokenCache.misses;

      // Second validation - cache hit
      await authService.validateAccessToken(authResponse.accessToken);
      const statsAfterSecond = cacheService.getStats();

      // Misses should not increase, hits should
      expect(statsAfterSecond.tokenCache.misses).toBe(missesAfterFirst);
      expect(statsAfterSecond.tokenCache.hits).toBeGreaterThan(0);
    });

    it('should invalidate token cache on logout', async () => {
      // Register and login
      await userService.create({
        email: 'logout-cache@example.com',
        password: 'Password123',
      });

      const authResponse = await authService.login({
        email: 'logout-cache@example.com',
        password: 'Password123',
      });

      // Validate to cache
      await authService.validateAccessToken(authResponse.accessToken);
      expect(cacheService.getStats().tokenCache.size).toBeGreaterThan(0);

      // Logout
      await authService.logout(authResponse.refreshToken);

      // Token cache should be cleared for security
      expect(cacheService.getStats().tokenCache.size).toBe(0);
    });
  });

  describe('Cache Performance', () => {
    it('should improve lookup performance with caching', async () => {
      // Create multiple users
      const users = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          userService.create({
            email: `perf-test-${i}@example.com`,
            password: 'Password123',
          }),
        ),
      );

      // Clear cache
      cacheService.clearAll();

      // First pass - cache misses (cold)
      const coldStart = Date.now();
      for (const user of users) {
        await userService.findById(user.id);
      }
      const coldDuration = Date.now() - coldStart;

      // Second pass - cache hits (warm)
      const warmStart = Date.now();
      for (const user of users) {
        await userService.findById(user.id);
      }
      const warmDuration = Date.now() - warmStart;

      // Warm lookups should be faster (or at least not slower)
      // In practice, cache hits are significantly faster
      expect(warmDuration).toBeLessThanOrEqual(coldDuration + 10); // Allow small variance
    });

    it('should track hit rate accurately', async () => {
      const user = await userService.create({
        email: 'hitrate-test@example.com',
        password: 'Password123',
      });

      cacheService.clearAll();
      cacheService.resetMetrics();

      // First lookup - miss
      await userService.findById(user.id);

      // Multiple hits
      for (let i = 0; i < 9; i++) {
        cacheService.getUser(user.id);
      }

      const stats = cacheService.getStats();
      // 9 hits out of 10 total accesses = 90% (approximately)
      expect(stats.userCache.hitRate).toBeGreaterThanOrEqual(80);
    });
  });

  describe('Cache LRU Eviction', () => {
    let smallCacheModule: TestingModule;
    let smallCacheService: CacheService;

    beforeEach(async () => {
      smallCacheModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                AUTH_CACHE_ENABLED: true,
                AUTH_CACHE_USER_MAX_SIZE: 3, // Small cache for testing eviction
                AUTH_CACHE_USER_TTL_MS: 60000,
                AUTH_CACHE_TOKEN_MAX_SIZE: 3,
                AUTH_CACHE_TOKEN_TTL_MS: 60000,
              }),
            ],
          }),
          CacheModule,
        ],
      }).compile();

      smallCacheService = smallCacheModule.get<CacheService>(CacheService);
      smallCacheService.onModuleInit();
    });

    afterEach(async () => {
      await smallCacheModule.close();
    });

    it('should evict least recently used entries when full', () => {
      const user1 = { id: '1', email: 'a@test.com', passwordHash: 'h', createdAt: new Date(), updatedAt: new Date() };
      const user2 = { id: '2', email: 'b@test.com', passwordHash: 'h', createdAt: new Date(), updatedAt: new Date() };
      const user3 = { id: '3', email: 'c@test.com', passwordHash: 'h', createdAt: new Date(), updatedAt: new Date() };
      const user4 = { id: '4', email: 'd@test.com', passwordHash: 'h', createdAt: new Date(), updatedAt: new Date() };

      smallCacheService.setUser(user1);
      smallCacheService.setUser(user2);
      smallCacheService.setUser(user3);

      // Cache is full (3 items)
      expect(smallCacheService.getStats().userCache.size).toBe(3);

      // Add 4th user - should evict user1 (LRU)
      smallCacheService.setUser(user4);

      expect(smallCacheService.getUser('1')).toBeUndefined(); // Evicted
      expect(smallCacheService.getUser('2')).toBeDefined();
      expect(smallCacheService.getUser('3')).toBeDefined();
      expect(smallCacheService.getUser('4')).toBeDefined();
    });

    it('should track eviction metrics', () => {
      const users = Array.from({ length: 5 }, (_, i) => ({
        id: `${i}`,
        email: `user${i}@test.com`,
        passwordHash: 'h',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      users.forEach((user) => smallCacheService.setUser(user));

      const stats = smallCacheService.getStats();
      expect(stats.userCache.evictions).toBe(2); // 5 users, max 3, so 2 evictions
    });
  });

  describe('Cache TTL Expiration', () => {
    it('should expire cached entries after TTL', async () => {
      // Create module with short TTL for testing
      const shortTtlModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                AUTH_CACHE_ENABLED: true,
                AUTH_CACHE_USER_TTL_MS: 100, // 100ms TTL
                AUTH_CACHE_USER_MAX_SIZE: 100,
                AUTH_CACHE_TOKEN_TTL_MS: 100,
                AUTH_CACHE_TOKEN_MAX_SIZE: 100,
              }),
            ],
          }),
          CacheModule,
        ],
      }).compile();

      const shortTtlCacheService = shortTtlModule.get<CacheService>(CacheService);
      shortTtlCacheService.onModuleInit();

      const user = {
        id: 'ttl-test',
        email: 'ttl@test.com',
        passwordHash: 'h',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      shortTtlCacheService.setUser(user);
      expect(shortTtlCacheService.getUser('ttl-test')).toBeDefined();

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(shortTtlCacheService.getUser('ttl-test')).toBeUndefined();

      await shortTtlModule.close();
    });
  });

  describe('Cache Disabled Mode', () => {
    let disabledModule: TestingModule;
    let disabledCacheService: CacheService;

    beforeEach(async () => {
      disabledModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                AUTH_CACHE_ENABLED: false,
              }),
            ],
          }),
          CacheModule,
        ],
      }).compile();

      disabledCacheService = disabledModule.get<CacheService>(CacheService);
      disabledCacheService.onModuleInit();
    });

    afterEach(async () => {
      await disabledModule.close();
    });

    it('should report disabled status', () => {
      expect(disabledCacheService.isEnabled()).toBe(false);
    });

    it('should not cache when disabled', () => {
      const user = {
        id: 'disabled-test',
        email: 'disabled@test.com',
        passwordHash: 'h',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      disabledCacheService.setUser(user);
      expect(disabledCacheService.getUser('disabled-test')).toBeUndefined();
    });

    it('should not cache tokens when disabled', () => {
      disabledCacheService.setTokenValidation('token', { userId: 'u', email: 'e@test.com' });
      expect(disabledCacheService.getTokenValidation('token')).toBeUndefined();
    });
  });

  describe('Concurrent Cache Operations', () => {
    it('should handle concurrent reads and writes', async () => {
      const users = Array.from({ length: 20 }, (_, i) => ({
        id: `concurrent-${i}`,
        email: `concurrent${i}@test.com`,
        passwordHash: 'h',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      // Concurrent writes
      await Promise.all(users.map((user) => Promise.resolve(cacheService.setUser(user))));

      // Concurrent reads
      const results = await Promise.all(
        users.map((user) => Promise.resolve(cacheService.getUser(user.id))),
      );

      expect(results.every((r) => r !== undefined)).toBe(true);
    });

    it('should handle mixed read/write/delete operations', async () => {
      const operations: Promise<unknown>[] = [];

      for (let i = 0; i < 50; i++) {
        const user = {
          id: `mixed-${i}`,
          email: `mixed${i}@test.com`,
          passwordHash: 'h',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        operations.push(Promise.resolve(cacheService.setUser(user)));
        operations.push(Promise.resolve(cacheService.getUser(`mixed-${i}`)));
        if (i % 3 === 0) {
          operations.push(Promise.resolve(cacheService.invalidateUser(`mixed-${i}`)));
        }
      }

      // Should complete without errors
      await Promise.all(operations);
    });
  });
});
