import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';
import { CachedUser } from './interfaces/cache.interface';

describe('CacheService', () => {
  let service: CacheService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue: any) => {
      const config: Record<string, any> = {
        AUTH_CACHE_ENABLED: true,
        AUTH_CACHE_USER_TTL_MS: 300000,
        AUTH_CACHE_USER_MAX_SIZE: 100,
        AUTH_CACHE_TOKEN_TTL_MS: 300000,
        AUTH_CACHE_TOKEN_MAX_SIZE: 500,
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<CacheService>(CacheService);
    configService = module.get<ConfigService>(ConfigService);

    // Trigger onModuleInit
    service.onModuleInit();
  });

  afterEach(() => {
    service.clearAll();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should be enabled by default', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('should be disabled when config says so', async () => {
      const disabledConfigService = {
        get: jest.fn((key: string, defaultValue: any) => {
          if (key === 'AUTH_CACHE_ENABLED') return false;
          return defaultValue;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CacheService,
          {
            provide: ConfigService,
            useValue: disabledConfigService,
          },
        ],
      }).compile();

      const disabledService = module.get<CacheService>(CacheService);
      disabledService.onModuleInit();

      expect(disabledService.isEnabled()).toBe(false);
    });
  });

  describe('user cache', () => {
    const mockUser: CachedUser = {
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    it('should cache and retrieve user by ID', () => {
      service.setUser(mockUser);
      const cached = service.getUser(mockUser.id);

      expect(cached).toEqual(mockUser);
    });

    it('should cache and retrieve user ID by email', () => {
      service.setUser(mockUser);
      const userId = service.getUserIdByEmail(mockUser.email);

      expect(userId).toBe(mockUser.id);
    });

    it('should handle case-insensitive email lookup', () => {
      service.setUser(mockUser);

      expect(service.getUserIdByEmail('TEST@EXAMPLE.COM')).toBe(mockUser.id);
      expect(service.getUserIdByEmail('Test@Example.Com')).toBe(mockUser.id);
    });

    it('should return undefined for non-cached user', () => {
      expect(service.getUser('nonexistent')).toBeUndefined();
      expect(service.getUserIdByEmail('nonexistent@example.com')).toBeUndefined();
    });

    it('should invalidate user cache', () => {
      service.setUser(mockUser);
      expect(service.getUser(mockUser.id)).toBeDefined();

      service.invalidateUser(mockUser.id, mockUser.email);

      expect(service.getUser(mockUser.id)).toBeUndefined();
      expect(service.getUserIdByEmail(mockUser.email)).toBeUndefined();
    });

    it('should invalidate user without email', () => {
      service.setUser(mockUser);
      service.invalidateUser(mockUser.id);

      expect(service.getUser(mockUser.id)).toBeUndefined();
      // Email index not cleared without email param
    });
  });

  describe('token cache', () => {
    const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
    const mockAuthUser = {
      userId: 'user-123',
      email: 'test@example.com',
    };

    it('should cache and retrieve token validation', () => {
      service.setTokenValidation(mockToken, mockAuthUser);
      const cached = service.getTokenValidation(mockToken);

      expect(cached).toEqual(mockAuthUser);
    });

    it('should return undefined for non-cached token', () => {
      expect(service.getTokenValidation('nonexistent-token')).toBeUndefined();
    });

    it('should invalidate specific token', () => {
      service.setTokenValidation(mockToken, mockAuthUser);
      expect(service.getTokenValidation(mockToken)).toBeDefined();

      service.invalidateToken(mockToken);

      expect(service.getTokenValidation(mockToken)).toBeUndefined();
    });

    it('should invalidate all tokens for user', () => {
      const token1 = 'token-1';
      const token2 = 'token-2';

      service.setTokenValidation(token1, mockAuthUser);
      service.setTokenValidation(token2, mockAuthUser);

      service.invalidateAllTokensForUser(mockAuthUser.userId);

      // All tokens should be cleared
      expect(service.getTokenValidation(token1)).toBeUndefined();
      expect(service.getTokenValidation(token2)).toBeUndefined();
    });

    it('should use token hash as cache key', () => {
      const hash1 = service.hashToken('token1');
      const hash2 = service.hashToken('token2');
      const hash1Again = service.hashToken('token1');

      expect(hash1).not.toBe('token1'); // Should be hashed
      expect(hash1).toBe(hash1Again); // Should be deterministic
      expect(hash1).not.toBe(hash2); // Different tokens = different hashes
      expect(hash1.length).toBe(64); // Full SHA256 hash for maximum collision resistance
    });

    it('should cache with custom TTL', () => {
      jest.useFakeTimers();

      service.setTokenValidation(mockToken, mockAuthUser, 1000);
      expect(service.getTokenValidation(mockToken)).toBeDefined();

      jest.advanceTimersByTime(1500);
      expect(service.getTokenValidation(mockToken)).toBeUndefined();

      jest.useRealTimers();
    });
  });

  describe('disabled cache', () => {
    let disabledService: CacheService;

    beforeEach(async () => {
      const disabledConfigService = {
        get: jest.fn((key: string, defaultValue: any) => {
          if (key === 'AUTH_CACHE_ENABLED') return false;
          return defaultValue;
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          CacheService,
          {
            provide: ConfigService,
            useValue: disabledConfigService,
          },
        ],
      }).compile();

      disabledService = module.get<CacheService>(CacheService);
      disabledService.onModuleInit();
    });

    it('should return undefined for user operations', () => {
      const mockUser: CachedUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      disabledService.setUser(mockUser);
      expect(disabledService.getUser(mockUser.id)).toBeUndefined();
      expect(disabledService.getUserIdByEmail(mockUser.email)).toBeUndefined();
    });

    it('should return undefined for token operations', () => {
      const mockAuthUser = { userId: 'user-123', email: 'test@example.com' };

      disabledService.setTokenValidation('token', mockAuthUser);
      expect(disabledService.getTokenValidation('token')).toBeUndefined();
    });
  });

  describe('statistics', () => {
    it('should track cache stats', () => {
      const mockUser: CachedUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      service.setUser(mockUser);
      service.getUser(mockUser.id); // Hit
      service.getUser('nonexistent'); // Miss

      const stats = service.getStats();

      expect(stats.userCache.hits).toBe(1);
      expect(stats.userCache.misses).toBe(1);
      expect(stats.userCache.size).toBe(1);
      expect(stats.userCache.hitRate).toBe(50);
    });

    it('should reset metrics', () => {
      service.setUser({
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      service.getUser('user-123');
      service.getUser('nonexistent');

      service.resetMetrics();

      const stats = service.getStats();
      expect(stats.userCache.hits).toBe(0);
      expect(stats.userCache.misses).toBe(0);
    });
  });

  describe('maintenance', () => {
    it('should clear all caches', () => {
      const mockUser: CachedUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      service.setUser(mockUser);
      service.setTokenValidation('token', { userId: 'user-123', email: 'test@example.com' });

      service.clearAll();

      expect(service.getUser(mockUser.id)).toBeUndefined();
      expect(service.getTokenValidation('token')).toBeUndefined();
    });

    it('should prune expired entries', () => {
      jest.useFakeTimers();

      service.setTokenValidation('token', { userId: 'user-123', email: 'test@example.com' }, 500);

      jest.advanceTimersByTime(700);

      const pruned = service.prune();
      expect(pruned).toBeGreaterThanOrEqual(1);

      jest.useRealTimers();
    });
  });
});
