import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserService } from '@/user/user.service';
import { User } from '@/user/user.entity';
import { CacheService } from '@/cache/cache.service';

describe('AuthService', () => {
  let authService: AuthService;
  let userService: UserService;
  let jwtService: JwtService;

  const mockUser = new User({
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: '$2b$10$hashedpassword',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              const config: Record<string, unknown> = {
                REDIS_ENABLED: false,
                REDIS_KEY_PREFIX: 'talksy:',
                JWT_SECRET: 'test-secret',
                JWT_ACCESS_EXPIRY: '15m',
                JWT_REFRESH_EXPIRY: '7d',
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockImplementation((payload, options) => {
              if (payload.tokenId) {
                return 'mock-refresh-token';
              }
              return 'mock-access-token';
            }),
            verify: jest.fn().mockImplementation((token) => {
              if (token === 'mock-access-token') {
                return { sub: 'user-123', email: 'test@example.com' };
              }
              if (token === 'mock-refresh-token') {
                return { sub: 'user-123', tokenId: 'token-id-123' };
              }
              if (token === 'valid-refresh-token') {
                return { sub: 'user-123', tokenId: 'valid-token-id' };
              }
              throw new Error('Invalid token');
            }),
          },
        },
        {
          provide: UserService,
          useValue: {
            create: jest.fn(),
            findByEmail: jest.fn(),
            findById: jest.fn(),
            validatePassword: jest.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: {
            isEnabled: jest.fn().mockReturnValue(true),
            getTokenValidation: jest.fn().mockReturnValue(undefined),
            setTokenValidation: jest.fn(),
            invalidateToken: jest.fn(),
            invalidateAllTokensForUser: jest.fn(),
            getUser: jest.fn().mockReturnValue(undefined),
            setUser: jest.fn(),
            invalidateUser: jest.fn(),
            clearAll: jest.fn(),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    userService = module.get<UserService>(UserService);
    jwtService = module.get<JwtService>(JwtService);
    await authService.onModuleInit();
  });

  afterEach(async () => {
    await authService.clearAllTokens();
    await authService.onModuleDestroy();
  });

  describe('register', () => {
    it('should register a new user and return tokens', async () => {
      jest.spyOn(userService, 'create').mockResolvedValue(mockUser);

      const result = await authService.register({
        email: 'test@example.com',
        password: 'Password123',
      });

      expect(result).toBeDefined();
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.user.id).toBe('user-123');
      expect(result.user.email).toBe('test@example.com');
      expect(userService.create).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'Password123',
      });
    });

    it('should propagate ConflictException from UserService', async () => {
      jest
        .spyOn(userService, 'create')
        .mockRejectedValue(new ConflictException('Email already registered'));

      await expect(
        authService.register({
          email: 'existing@example.com',
          password: 'Password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should login user with valid credentials', async () => {
      jest.spyOn(userService, 'findByEmail').mockResolvedValue(mockUser);
      jest.spyOn(userService, 'validatePassword').mockResolvedValue(true);

      const result = await authService.login({
        email: 'test@example.com',
        password: 'Password123',
      });

      expect(result).toBeDefined();
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(result.user.id).toBe('user-123');
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      jest.spyOn(userService, 'findByEmail').mockResolvedValue(null);

      await expect(
        authService.login({
          email: 'nonexistent@example.com',
          password: 'Password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      jest.spyOn(userService, 'findByEmail').mockResolvedValue(mockUser);
      jest.spyOn(userService, 'validatePassword').mockResolvedValue(false);

      await expect(
        authService.login({
          email: 'test@example.com',
          password: 'WrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('should issue new tokens with valid refresh token', async () => {
      // Mock user service
      jest.spyOn(userService, 'create').mockResolvedValue(mockUser);
      jest.spyOn(userService, 'findById').mockResolvedValue(mockUser);

      // Track the stored token ID
      let storedTokenId: string = '';

      jest.spyOn(jwtService, 'sign').mockImplementation((payload: object) => {
        if ('tokenId' in payload) {
          storedTokenId = (payload as { tokenId: string }).tokenId;
          return 'stored-refresh-token';
        }
        return 'mock-access-token';
      });

      // Register to store a refresh token
      await authService.register({
        email: 'test@example.com',
        password: 'Password123',
      });

      // Verify returns the stored token ID
      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'user-123',
        tokenId: storedTokenId,
      });

      const result = await authService.refreshToken('stored-refresh-token');

      expect(result).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });

    it('should throw UnauthorizedException for invalid refresh token', async () => {
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(authService.refreshToken('invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException for revoked refresh token', async () => {
      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'user-123',
        tokenId: 'revoked-token-id',
      });

      await expect(
        authService.refreshToken('revoked-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      jest.spyOn(userService, 'create').mockResolvedValue(mockUser);

      // Store a token first
      let storedTokenId: string;
      jest.spyOn(jwtService, 'sign').mockImplementation((payload: object) => {
        if ('tokenId' in payload) {
          storedTokenId = (payload as { tokenId: string }).tokenId;
          return 'stored-refresh-token';
        }
        return 'mock-access-token';
      });

      await authService.register({
        email: 'test@example.com',
        password: 'Password123',
      });

      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'user-123',
        tokenId: storedTokenId!,
      });

      jest.spyOn(userService, 'findById').mockResolvedValue(null);

      await expect(
        authService.refreshToken('stored-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should revoke refresh token on logout', async () => {
      jest.spyOn(userService, 'create').mockResolvedValue(mockUser);

      let storedTokenId: string;
      jest.spyOn(jwtService, 'sign').mockImplementation((payload: object) => {
        if ('tokenId' in payload) {
          storedTokenId = (payload as { tokenId: string }).tokenId;
          return 'stored-refresh-token';
        }
        return 'mock-access-token';
      });

      await authService.register({
        email: 'test@example.com',
        password: 'Password123',
      });

      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'user-123',
        tokenId: storedTokenId!,
      });

      await authService.logout('stored-refresh-token');

      // Token should now be invalid
      await expect(
        authService.refreshToken('stored-refresh-token'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should not throw for invalid token on logout', async () => {
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      // Should not throw
      await expect(
        authService.logout('invalid-token'),
      ).resolves.not.toThrow();
    });
  });

  describe('validateAccessToken', () => {
    it('should return auth user for valid token', async () => {
      jest.spyOn(jwtService, 'verify').mockReturnValue({
        sub: 'user-123',
        email: 'test@example.com',
      });

      const result = await authService.validateAccessToken('valid-access-token');

      expect(result).toBeDefined();
      expect(result?.userId).toBe('user-123');
      expect(result?.email).toBe('test@example.com');
    });

    it('should return null for invalid token', async () => {
      jest.spyOn(jwtService, 'verify').mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = await authService.validateAccessToken('invalid-token');

      expect(result).toBeNull();
    });
  });
});
