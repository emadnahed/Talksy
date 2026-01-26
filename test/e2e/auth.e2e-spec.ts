import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '@/app.module';
import { CacheService } from '@/cache/cache.service';
import { UserService } from '@/user/user.service';
import { AuthService } from '@/auth/auth.service';
import { ResponseInterceptor } from '@/common/interceptors/response.interceptor';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';

describe('Auth E2E Tests', () => {
  let app: INestApplication;
  let cacheService: CacheService;
  let userService: UserService;
  let authService: AuthService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());

    cacheService = moduleFixture.get<CacheService>(CacheService);
    userService = moduleFixture.get<UserService>(UserService);
    authService = moduleFixture.get<AuthService>(AuthService);

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clear all data before each test
    cacheService.clearAll();
    await userService.clearAllUsers();
    await authService.clearAllTokens();
    cacheService.resetMetrics();
  });

  describe('POST /auth/register', () => {
    it('should register a new user and cache the user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'newuser@example.com',
          password: 'Password123',
        })
        .expect(201);

      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data).toHaveProperty('user');
      expect(response.body.data.user.email).toBe('newuser@example.com');

      // Verify user is cached
      const userId = response.body.data.user.id;
      const cachedUser = cacheService.getUser(userId);
      expect(cachedUser).toBeDefined();
      expect(cachedUser!.email).toBe('newuser@example.com');
    });

    it('should reject duplicate email registration', async () => {
      // First registration
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'Password123',
        })
        .expect(201);

      // Second registration with same email
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'duplicate@example.com',
          password: 'Password456',
        })
        .expect(409);

      expect(response.body.code).toBe('MSG_INTERNAL_ERROR'); // 409 Conflict maps to internal error
    });

    it('should reject invalid password format', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test@example.com',
          password: 'weak',
        })
        .expect(400);

      expect(response.body.code).toBe('MSG_BAD_REQUEST');
    });

    it('should reject invalid email format', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'not-an-email',
          password: 'Password123',
        })
        .expect(400);

      expect(response.body.code).toBe('MSG_BAD_REQUEST');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'login-test@example.com',
          password: 'Password123',
        });
    });

    it('should login successfully and return tokens', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'login-test@example.com',
          password: 'Password123',
        })
        .expect(200);

      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data).toHaveProperty('expiresIn');
      expect(response.body.data.user.email).toBe('login-test@example.com');
    });

    it('should reject invalid password', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'login-test@example.com',
          password: 'WrongPassword123',
        })
        .expect(401);

      expect(response.body.code).toBe('MSG_UNAUTHORIZED');
    });

    it('should reject non-existent user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'Password123',
        })
        .expect(401);

      expect(response.body.code).toBe('MSG_UNAUTHORIZED');
    });
  });

  describe('GET /auth/me', () => {
    let accessToken: string;
    let userId: string;

    beforeEach(async () => {
      // Register and login
      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'me-test@example.com',
          password: 'Password123',
        });

      accessToken = registerResponse.body.data.accessToken;
      userId = registerResponse.body.data.user.id;
    });

    it('should return current user info', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.email).toBe('me-test@example.com');
      expect(response.body.data.id).toBe(userId);
    });

    it('should cache token validation on first request', async () => {
      // Clear cache
      cacheService.clearAll();
      cacheService.resetMetrics();

      // First request - cache miss
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const statsAfterFirst = cacheService.getStats();

      // Second request - should be cache hit
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const statsAfterSecond = cacheService.getStats();

      // Verify cache hit occurred
      expect(statsAfterSecond.tokenCache.hits).toBeGreaterThan(statsAfterFirst.tokenCache.hits);
    });

    it('should reject request without token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);

      expect(response.body.code).toBe('MSG_UNAUTHORIZED');
    });

    it('should reject request with invalid token', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.code).toBe('MSG_UNAUTHORIZED');
    });
  });

  describe('POST /auth/refresh', () => {
    let refreshToken: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'refresh-test@example.com',
          password: 'Password123',
        });

      refreshToken = response.body.data.refreshToken;
    });

    it('should refresh tokens successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(response.body.data).toHaveProperty('accessToken');
      expect(response.body.data).toHaveProperty('refreshToken');
      expect(response.body.data).toHaveProperty('expiresIn');

      // New tokens should be different from old
      expect(response.body.data.refreshToken).not.toBe(refreshToken);
    });

    it('should invalidate old refresh token after use', async () => {
      // First refresh
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      // Try to use old refresh token again
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(response.body.code).toBe('MSG_UNAUTHORIZED');
    });

    it('should reject invalid refresh token', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-refresh-token' })
        .expect(401);

      expect(response.body.code).toBe('MSG_UNAUTHORIZED');
    });
  });

  describe('POST /auth/logout', () => {
    let refreshToken: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'logout-test@example.com',
          password: 'Password123',
        });

      refreshToken = response.body.data.refreshToken;
    });

    it('should logout successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken })
        .expect(200);

      expect(response.body.data.success).toBe(true);
    });

    it('should invalidate refresh token after logout', async () => {
      // Logout
      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken })
        .expect(200);

      // Try to refresh with logged out token
      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      expect(response.body.code).toBe('MSG_UNAUTHORIZED');
    });

    it('should clear token cache on logout', async () => {
      // Make some requests to populate cache
      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'logout-test@example.com',
          password: 'Password123',
        });

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${loginResponse.body.data.accessToken}`)
        .expect(200);

      // Verify cache has tokens
      expect(cacheService.getStats().tokenCache.size).toBeGreaterThan(0);

      // Logout
      await request(app.getHttpServer())
        .post('/auth/logout')
        .send({ refreshToken: loginResponse.body.data.refreshToken })
        .expect(200);

      // Token cache should be cleared for security
      expect(cacheService.getStats().tokenCache.size).toBe(0);
    });
  });

  describe('Cache Performance in Auth Flow', () => {
    it('should achieve high cache hit rate with repeated requests', async () => {
      // Register user
      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'cache-perf@example.com',
          password: 'Password123',
        });

      const accessToken = registerResponse.body.data.accessToken;

      // Clear cache and metrics
      cacheService.clearAll();
      cacheService.resetMetrics();

      // Make multiple requests
      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .get('/auth/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);
      }

      const stats = cacheService.getStats();

      // Expect high hit rate (9 hits out of 10 requests = 90%)
      expect(stats.tokenCache.hitRate).toBeGreaterThanOrEqual(80);
    });

    it('should handle multiple sequential authenticated requests', async () => {
      // Register user
      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'sequential@example.com',
          password: 'Password123',
        });

      const accessToken = registerResponse.body.data.accessToken;

      // Make 5 sequential requests (more stable in test environment)
      for (let i = 0; i < 5; i++) {
        const res = await request(app.getHttpServer())
          .get('/auth/me')
          .set('Authorization', `Bearer ${accessToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.email).toBe('sequential@example.com');
      }
    });
  });

  describe('Cache Statistics Endpoint', () => {
    it('should track cache statistics accurately', async () => {
      // Create some auth activity
      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'stats-test@example.com',
          password: 'Password123',
        });

      const accessToken = registerResponse.body.data.accessToken;

      // Make requests
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .get('/auth/me')
          .set('Authorization', `Bearer ${accessToken}`);
      }

      const stats = cacheService.getStats();

      // Verify stats are tracked
      expect(stats.userCache.size).toBeGreaterThanOrEqual(1);
      expect(stats.tokenCache.hits + stats.tokenCache.misses).toBeGreaterThan(0);
    });
  });
});
