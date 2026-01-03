import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';
import { RateLimitResult } from './interfaces/rate-limit-config.interface';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let mockRateLimitService: jest.Mocked<RateLimitService>;
  let mockEmit: jest.Mock;

  const createMockExecutionContext = (
    clientId = 'test-client',
  ): ExecutionContext => {
    mockEmit = jest.fn();
    const mockClient = {
      id: clientId,
      emit: mockEmit,
    };

    return {
      switchToWs: () => ({
        getClient: () => mockClient,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    mockRateLimitService = {
      isEnabled: jest.fn(),
      consume: jest.fn(),
    } as unknown as jest.Mocked<RateLimitService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitGuard,
        { provide: RateLimitService, useValue: mockRateLimitService },
      ],
    }).compile();

    guard = module.get<RateLimitGuard>(RateLimitGuard);
  });

  describe('when rate limiting is disabled', () => {
    beforeEach(() => {
      mockRateLimitService.isEnabled.mockReturnValue(false);
    });

    it('should allow all requests', () => {
      const context = createMockExecutionContext();
      expect(guard.canActivate(context)).toBe(true);
      expect(mockRateLimitService.consume).not.toHaveBeenCalled();
    });
  });

  describe('when rate limiting is enabled', () => {
    beforeEach(() => {
      mockRateLimitService.isEnabled.mockReturnValue(true);
    });

    it('should allow request when under limit', () => {
      const result: RateLimitResult = {
        allowed: true,
        remaining: 9,
        resetAt: Date.now() + 60000,
      };
      mockRateLimitService.consume.mockReturnValue(result);

      const context = createMockExecutionContext();
      expect(guard.canActivate(context)).toBe(true);
      expect(mockRateLimitService.consume).toHaveBeenCalledWith('test-client');
    });

    it('should deny request when limit exceeded', () => {
      const result: RateLimitResult = {
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 30000,
        retryAfter: 30,
      };
      mockRateLimitService.consume.mockReturnValue(result);

      const context = createMockExecutionContext();
      expect(() => guard.canActivate(context)).toThrow(WsException);
    });

    it('should emit rate_limit event when limit exceeded', () => {
      const resetAt = Date.now() + 30000;
      const result: RateLimitResult = {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: 30,
      };
      mockRateLimitService.consume.mockReturnValue(result);

      const context = createMockExecutionContext();

      try {
        guard.canActivate(context);
      } catch {
        // Expected to throw
      }

      expect(mockEmit).toHaveBeenCalledWith('rate_limit', {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please slow down.',
        remaining: 0,
        resetAt,
        retryAfter: 30,
      });
    });

    it('should throw WsException with correct error details', () => {
      const result: RateLimitResult = {
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 30000,
        retryAfter: 30,
      };
      mockRateLimitService.consume.mockReturnValue(result);

      const context = createMockExecutionContext();

      try {
        guard.canActivate(context);
        fail('Should have thrown WsException');
      } catch (e) {
        expect(e).toBeInstanceOf(WsException);
        expect((e as WsException).getError()).toEqual({
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Rate limit exceeded. Retry after 30 seconds.',
          retryAfter: 30,
        });
      }
    });

    it('should use correct client ID', () => {
      const result: RateLimitResult = {
        allowed: true,
        remaining: 5,
        resetAt: Date.now() + 60000,
      };
      mockRateLimitService.consume.mockReturnValue(result);

      const context = createMockExecutionContext('specific-client-id');
      guard.canActivate(context);

      expect(mockRateLimitService.consume).toHaveBeenCalledWith(
        'specific-client-id',
      );
    });
  });
});
