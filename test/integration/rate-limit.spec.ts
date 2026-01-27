import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { RateLimitModule } from '@/rate-limit/rate-limit.module';
import { RateLimitService } from '@/rate-limit/rate-limit.service';

describe('RateLimitModule Integration', () => {
  let module: TestingModule;
  let rateLimitService: RateLimitService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              RATE_LIMIT_ENABLED: true,
              RATE_LIMIT_WINDOW_MS: 1000, // 1 second for testing
              RATE_LIMIT_MAX_REQUESTS: 3,
            }),
          ],
        }),
        RateLimitModule,
      ],
    }).compile();

    rateLimitService = module.get<RateLimitService>(RateLimitService);
  });

  afterEach(async () => {
    rateLimitService.clearAll();
    rateLimitService.onModuleDestroy();
    await module.close();
  });

  describe('Module Integration', () => {
    it('should provide RateLimitService', () => {
      expect(rateLimitService).toBeDefined();
      expect(rateLimitService).toBeInstanceOf(RateLimitService);
    });

    it('should be enabled by default', () => {
      expect(rateLimitService.isEnabled()).toBe(true);
    });

    it('should return config', () => {
      const config = rateLimitService.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.windowMs).toBe(1000);
      expect(config.maxRequests).toBe(3);
    });
  });

  describe('Rate Limiting Flow', () => {
    it('should allow requests within limit', () => {
      const clientId = 'test-client-1';

      const result1 = rateLimitService.consume(clientId);
      expect(result1.allowed).toBe(true);
      expect(result1.remaining).toBe(2);

      const result2 = rateLimitService.consume(clientId);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(1);

      const result3 = rateLimitService.consume(clientId);
      expect(result3.allowed).toBe(true);
      expect(result3.remaining).toBe(0);
    });

    it('should deny requests over limit', () => {
      const clientId = 'test-client-2';

      // Use up the limit
      rateLimitService.consume(clientId);
      rateLimitService.consume(clientId);
      rateLimitService.consume(clientId);

      // 4th request should be denied
      const result = rateLimitService.consume(clientId);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should track request count correctly', () => {
      const clientId = 'test-client-3';

      expect(rateLimitService.getRequestCount(clientId)).toBe(0);

      rateLimitService.consume(clientId);
      expect(rateLimitService.getRequestCount(clientId)).toBe(1);

      rateLimitService.consume(clientId);
      expect(rateLimitService.getRequestCount(clientId)).toBe(2);
    });

    it('should reset client rate limit', () => {
      const clientId = 'test-client-4';

      rateLimitService.consume(clientId);
      rateLimitService.consume(clientId);
      expect(rateLimitService.getRequestCount(clientId)).toBe(2);

      rateLimitService.resetClient(clientId);
      expect(rateLimitService.getRequestCount(clientId)).toBe(0);
    });

    it('should handle multiple clients independently', () => {
      const client1 = 'client-1';
      const client2 = 'client-2';

      // Use up client1's limit
      rateLimitService.consume(client1);
      rateLimitService.consume(client1);
      rateLimitService.consume(client1);
      rateLimitService.consume(client1);

      // client2 should still be allowed
      const result = rateLimitService.consume(client2);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('should reset after window expires', async () => {
      const clientId = 'test-client-5';

      // Use up the limit
      rateLimitService.consume(clientId);
      rateLimitService.consume(clientId);
      rateLimitService.consume(clientId);

      // Should be denied
      const deniedResult = rateLimitService.consume(clientId);
      expect(deniedResult.allowed).toBe(false);

      // Wait for window to expire (1 second + buffer)
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should be allowed again
      const allowedResult = rateLimitService.consume(clientId);
      expect(allowedResult.allowed).toBe(true);
      expect(allowedResult.remaining).toBe(2);
    });
  });

  describe('Check and Record Separately', () => {
    it('should check without recording', () => {
      const clientId = 'test-client-check';

      const check1 = rateLimitService.checkLimit(clientId);
      expect(check1.allowed).toBe(true);
      expect(check1.remaining).toBe(3);

      // Check again - should still be 3 since nothing recorded
      const check2 = rateLimitService.checkLimit(clientId);
      expect(check2.allowed).toBe(true);
      expect(check2.remaining).toBe(3);
    });

    it('should record request separately', () => {
      const clientId = 'test-client-record';

      rateLimitService.recordRequest(clientId);
      expect(rateLimitService.getRequestCount(clientId)).toBe(1);

      rateLimitService.recordRequest(clientId);
      expect(rateLimitService.getRequestCount(clientId)).toBe(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle non-existent client gracefully', () => {
      const count = rateLimitService.getRequestCount('non-existent');
      expect(count).toBe(0);
    });

    it('should handle reset of non-existent client', () => {
      expect(() => {
        rateLimitService.resetClient('non-existent');
      }).not.toThrow();
    });

    it('should handle clearAll', () => {
      rateLimitService.consume('client-1');
      rateLimitService.consume('client-2');

      rateLimitService.clearAll();

      expect(rateLimitService.getRequestCount('client-1')).toBe(0);
      expect(rateLimitService.getRequestCount('client-2')).toBe(0);
    });
  });
});

describe('RateLimitModule Disabled', () => {
  let module: TestingModule;
  let rateLimitService: RateLimitService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              RATE_LIMIT_ENABLED: false,
              RATE_LIMIT_WINDOW_MS: 1000,
              RATE_LIMIT_MAX_REQUESTS: 3,
            }),
          ],
        }),
        RateLimitModule,
      ],
    }).compile();

    rateLimitService = module.get<RateLimitService>(RateLimitService);
  });

  afterEach(async () => {
    rateLimitService.onModuleDestroy();
    await module.close();
  });

  it('should allow all requests when disabled', () => {
    const clientId = 'disabled-test-client';

    // Should allow unlimited requests
    for (let i = 0; i < 20; i++) {
      const result = rateLimitService.consume(clientId);
      expect(result.allowed).toBe(true);
      // consume decrements remaining by 1, so it's maxRequests - 1 = 2
      expect(result.remaining).toBe(2);
    }
  });

  it('should not record requests when disabled', () => {
    const clientId = 'disabled-test-client-2';

    rateLimitService.recordRequest(clientId);
    rateLimitService.recordRequest(clientId);

    // Since recording is disabled, count should be 0
    expect(rateLimitService.getRequestCount(clientId)).toBe(0);
  });
});
