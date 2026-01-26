import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import { JwtAuthGuard, getAuthUser } from './auth.guard';
import { AuthService } from './auth.service';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let authService: AuthService;

  const createMockExecutionContext = (
    type: 'http' | 'ws',
    options: {
      authHeader?: string;
      authToken?: string;
      queryToken?: string;
    } = {},
  ): ExecutionContext => {
    const mockRequest = {
      headers: {
        authorization: options.authHeader,
      },
      user: null,
    };

    const mockSocket = {
      handshake: {
        headers: {
          authorization: options.authHeader,
        },
        auth: {
          token: options.authToken,
        },
        query: {
          token: options.queryToken,
        },
        address: '127.0.0.1',
      },
      data: {},
    };

    return {
      getType: () => type,
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      switchToWs: () => ({
        getClient: () => mockSocket,
      }),
    } as unknown as ExecutionContext;
  };

  describe('with auth enabled', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          JwtAuthGuard,
          {
            provide: AuthService,
            useValue: {
              validateAccessToken: jest.fn(),
            },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: unknown) => {
                const config: Record<string, unknown> = {
                  AUTH_ENABLED: true,
                  AUTH_BYPASS_IN_DEV: false,
                  NODE_ENV: 'production',
                };
                return config[key] ?? defaultValue;
              }),
            },
          },
        ],
      }).compile();

      guard = module.get<JwtAuthGuard>(JwtAuthGuard);
      authService = module.get<AuthService>(AuthService);
    });

    describe('HTTP requests', () => {
      it('should allow valid Bearer token', async () => {
        jest.spyOn(authService, 'validateAccessToken').mockResolvedValue({
          userId: 'user-123',
          email: 'test@example.com',
        });

        const context = createMockExecutionContext('http', {
          authHeader: 'Bearer valid-token',
        });

        const result = await guard.canActivate(context);

        expect(result).toBe(true);
        expect(authService.validateAccessToken).toHaveBeenCalledWith('valid-token');
      });

      it('should reject request without token', async () => {
        const context = createMockExecutionContext('http', {});

        await expect(guard.canActivate(context)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('should reject invalid token', async () => {
        jest.spyOn(authService, 'validateAccessToken').mockResolvedValue(null);

        const context = createMockExecutionContext('http', {
          authHeader: 'Bearer invalid-token',
        });

        await expect(guard.canActivate(context)).rejects.toThrow(
          UnauthorizedException,
        );
      });

      it('should reject non-Bearer auth header', async () => {
        const context = createMockExecutionContext('http', {
          authHeader: 'Basic some-credentials',
        });

        await expect(guard.canActivate(context)).rejects.toThrow(
          UnauthorizedException,
        );
      });
    });

    describe('WebSocket connections', () => {
      it('should allow valid token from auth object', async () => {
        jest.spyOn(authService, 'validateAccessToken').mockResolvedValue({
          userId: 'user-123',
          email: 'test@example.com',
        });

        const context = createMockExecutionContext('ws', {
          authToken: 'valid-token',
        });

        const result = await guard.canActivate(context);

        expect(result).toBe(true);
      });

      it('should allow valid token from Authorization header', async () => {
        jest.spyOn(authService, 'validateAccessToken').mockResolvedValue({
          userId: 'user-123',
          email: 'test@example.com',
        });

        const context = createMockExecutionContext('ws', {
          authHeader: 'Bearer valid-token',
        });

        const result = await guard.canActivate(context);

        expect(result).toBe(true);
      });

      it('should allow valid token from query parameter', async () => {
        jest.spyOn(authService, 'validateAccessToken').mockResolvedValue({
          userId: 'user-123',
          email: 'test@example.com',
        });

        const context = createMockExecutionContext('ws', {
          queryToken: 'valid-token',
        });

        const result = await guard.canActivate(context);

        expect(result).toBe(true);
      });

      it('should reject WebSocket without token', async () => {
        const context = createMockExecutionContext('ws', {});

        await expect(guard.canActivate(context)).rejects.toThrow(WsException);
      });

      it('should reject WebSocket with invalid token', async () => {
        jest.spyOn(authService, 'validateAccessToken').mockResolvedValue(null);

        const context = createMockExecutionContext('ws', {
          authToken: 'invalid-token',
        });

        await expect(guard.canActivate(context)).rejects.toThrow(WsException);
      });

      it('should attach user to socket data', async () => {
        const mockUser = { userId: 'user-123', email: 'test@example.com' };
        jest.spyOn(authService, 'validateAccessToken').mockResolvedValue(mockUser);

        const context = createMockExecutionContext('ws', {
          authToken: 'valid-token',
        });

        await guard.canActivate(context);

        const socket = context.switchToWs().getClient();
        expect(socket.data.user).toEqual(mockUser);
      });
    });
  });

  describe('with auth disabled', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          JwtAuthGuard,
          {
            provide: AuthService,
            useValue: {
              validateAccessToken: jest.fn(),
            },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: unknown) => {
                const config: Record<string, unknown> = {
                  AUTH_ENABLED: false,
                  AUTH_BYPASS_IN_DEV: false,
                  NODE_ENV: 'production',
                };
                return config[key] ?? defaultValue;
              }),
            },
          },
        ],
      }).compile();

      guard = module.get<JwtAuthGuard>(JwtAuthGuard);
      authService = module.get<AuthService>(AuthService);
    });

    it('should allow all requests when auth is disabled', async () => {
      const context = createMockExecutionContext('http', {});

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(authService.validateAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('with dev bypass enabled', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          JwtAuthGuard,
          {
            provide: AuthService,
            useValue: {
              validateAccessToken: jest.fn(),
            },
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: unknown) => {
                const config: Record<string, unknown> = {
                  AUTH_ENABLED: true,
                  AUTH_BYPASS_IN_DEV: true,
                  NODE_ENV: 'development',
                };
                return config[key] ?? defaultValue;
              }),
            },
          },
        ],
      }).compile();

      guard = module.get<JwtAuthGuard>(JwtAuthGuard);
      authService = module.get<AuthService>(AuthService);
    });

    it('should bypass auth in development mode', async () => {
      const context = createMockExecutionContext('http', {});

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
      expect(authService.validateAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('getAuthUser helper', () => {
    it('should return user from socket data', () => {
      const mockSocket = {
        data: {
          user: { userId: 'user-123', email: 'test@example.com' },
        },
      };

      const result = getAuthUser(mockSocket as never);

      expect(result).toEqual({ userId: 'user-123', email: 'test@example.com' });
    });

    it('should return null if no user on socket', () => {
      const mockSocket = {
        data: {},
      };

      const result = getAuthUser(mockSocket as never);

      expect(result).toBeNull();
    });

    it('should return null if socket data is empty', () => {
      const mockSocket = {};

      const result = getAuthUser(mockSocket as never);

      expect(result).toBeNull();
    });
  });
});
