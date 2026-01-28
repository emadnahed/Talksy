/**
 * MongoDB Load Tests
 *
 * Tests MongoDB performance under load including:
 * - Bulk operations
 * - Concurrent connections
 * - Sustained write load
 * - Read-heavy workloads
 * - Mixed workload scenarios
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

interface LoadMetrics {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  totalDurationMs: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  operationsPerSecond: number;
}

function calculateLoadMetrics(latencies: number[]): LoadMetrics {
  if (latencies.length === 0) {
    return {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      totalDurationMs: 0,
      avgLatencyMs: 0,
      minLatencyMs: 0,
      maxLatencyMs: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      operationsPerSecond: 0,
    };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  const percentile = (p: number): number => {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  };

  return {
    totalOperations: sorted.length,
    successfulOperations: sorted.length,
    failedOperations: 0,
    totalDurationMs: sum,
    avgLatencyMs: sum / sorted.length,
    minLatencyMs: sorted[0],
    maxLatencyMs: sorted[sorted.length - 1],
    p50LatencyMs: percentile(50),
    p95LatencyMs: percentile(95),
    p99LatencyMs: percentile(99),
    operationsPerSecond: (sorted.length / sum) * 1000,
  };
}

function logLoadMetrics(name: string, metrics: LoadMetrics): void {
  console.log(`\n📊 ${name} Load Test Results:`);
  console.log(`   Total Operations:  ${metrics.totalOperations}`);
  console.log(`   Successful:        ${metrics.successfulOperations}`);
  console.log(`   Failed:            ${metrics.failedOperations}`);
  console.log(`   Total Duration:    ${metrics.totalDurationMs.toFixed(2)}ms`);
  console.log(`   Avg Latency:       ${metrics.avgLatencyMs.toFixed(2)}ms`);
  console.log(`   Min Latency:       ${metrics.minLatencyMs.toFixed(2)}ms`);
  console.log(`   Max Latency:       ${metrics.maxLatencyMs.toFixed(2)}ms`);
  console.log(`   p50 Latency:       ${metrics.p50LatencyMs.toFixed(2)}ms`);
  console.log(`   p95 Latency:       ${metrics.p95LatencyMs.toFixed(2)}ms`);
  console.log(`   p99 Latency:       ${metrics.p99LatencyMs.toFixed(2)}ms`);
  console.log(`   Ops/Second:        ${metrics.operationsPerSecond.toFixed(2)}`);
}

describe('MongoDB Load Tests', () => {
  let module: TestingModule;
  let mongoServer: MongoMemoryServer;
  let userModel: Model<UserDocument>;
  let userService: UserService;
  let cacheService: CacheService;
  let connection: Connection;

  // Test timeouts for load tests
  jest.setTimeout(120000);

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
              AUTH_CACHE_USER_TTL_MS: 30000,
              AUTH_CACHE_USER_MAX_SIZE: 10000,
              AUTH_CACHE_TOKEN_TTL_MS: 30000,
              AUTH_CACHE_TOKEN_MAX_SIZE: 10000,
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
    await userModel.deleteMany({});
    cacheService.clearAll();
  });

  describe('Bulk Write Operations', () => {
    it('should handle 100 concurrent user creations', async () => {
      const latencies: number[] = [];
      const operations = Array.from({ length: 100 }, async (_, i) => {
        const start = performance.now();
        try {
          await userModel.create({
            email: `bulk-write-${i}@test.com`,
            passwordHash: `hash${i}`,
          });
          latencies.push(performance.now() - start);
        } catch {
          // Handle duplicate key errors silently
        }
      });

      await Promise.all(operations);

      const metrics = calculateLoadMetrics(latencies);
      logLoadMetrics('100 Concurrent Creates', metrics);

      expect(metrics.successfulOperations).toBe(100);
      // mongodb-memory-server is slower than real MongoDB
      expect(metrics.p95LatencyMs).toBeLessThan(2000);
    });

    it('should handle 500 sequential user creations', async () => {
      const latencies: number[] = [];

      for (let i = 0; i < 500; i++) {
        const start = performance.now();
        await userModel.create({
          email: `seq-write-${i}@test.com`,
          passwordHash: `hash${i}`,
        });
        latencies.push(performance.now() - start);
      }

      const metrics = calculateLoadMetrics(latencies);
      logLoadMetrics('500 Sequential Creates', metrics);

      expect(metrics.successfulOperations).toBe(500);
      expect(metrics.avgLatencyMs).toBeLessThan(50);
    });

    it('should handle bulk insert with insertMany', async () => {
      const users = Array.from({ length: 1000 }, (_, i) => ({
        email: `bulk-insert-${i}@test.com`,
        passwordHash: `hash${i}`,
      }));

      const start = performance.now();
      await userModel.insertMany(users);
      const duration = performance.now() - start;

      console.log(`\n📊 Bulk Insert 1000 Users:`);
      console.log(`   Duration: ${duration.toFixed(2)}ms`);
      console.log(`   Avg per doc: ${(duration / 1000).toFixed(2)}ms`);

      const count = await userModel.countDocuments({});
      expect(count).toBe(1000);
      expect(duration).toBeLessThan(5000);
    });
  });

  describe('Bulk Read Operations', () => {
    beforeEach(async () => {
      // Seed data
      const users = Array.from({ length: 500 }, (_, i) => ({
        email: `read-test-${i}@test.com`,
        passwordHash: `hash${i}`,
      }));
      await userModel.insertMany(users);
    });

    it('should handle 200 concurrent reads by email', async () => {
      const latencies: number[] = [];
      const operations = Array.from({ length: 200 }, async (_, i) => {
        const email = `read-test-${i % 500}@test.com`;
        const start = performance.now();
        await userModel.findOne({ email });
        latencies.push(performance.now() - start);
      });

      await Promise.all(operations);

      const metrics = calculateLoadMetrics(latencies);
      logLoadMetrics('200 Concurrent Email Lookups', metrics);

      // mongodb-memory-server is slower than real MongoDB
      expect(metrics.p95LatencyMs).toBeLessThan(2000);
    });

    it('should handle 500 sequential reads by ID', async () => {
      // Get all user IDs first
      const users = await userModel.find({}).select('_id').lean();
      const ids = users.map((u) => u._id);

      const latencies: number[] = [];
      for (let i = 0; i < 500; i++) {
        const start = performance.now();
        await userModel.findById(ids[i % ids.length]);
        latencies.push(performance.now() - start);
      }

      const metrics = calculateLoadMetrics(latencies);
      logLoadMetrics('500 Sequential ID Lookups', metrics);

      expect(metrics.avgLatencyMs).toBeLessThan(20);
    });

    it('should handle pagination under load', async () => {
      const latencies: number[] = [];
      const pageSize = 50;
      const totalPages = 10;

      for (let page = 0; page < totalPages; page++) {
        const start = performance.now();
        await userModel.find({}).skip(page * pageSize).limit(pageSize);
        latencies.push(performance.now() - start);
      }

      const metrics = calculateLoadMetrics(latencies);
      logLoadMetrics('10 Paginated Reads (50 per page)', metrics);

      expect(metrics.avgLatencyMs).toBeLessThan(50);
    });
  });

  describe('Mixed Workload', () => {
    it('should handle mixed read/write workload', async () => {
      // Seed some data
      const seedUsers = Array.from({ length: 100 }, (_, i) => ({
        email: `mixed-seed-${i}@test.com`,
        passwordHash: `hash${i}`,
      }));
      await userModel.insertMany(seedUsers);

      const readLatencies: number[] = [];
      const writeLatencies: number[] = [];
      const operations: Promise<void>[] = [];

      // 70% reads, 30% writes
      for (let i = 0; i < 200; i++) {
        if (i % 10 < 7) {
          // Read
          operations.push(
            (async () => {
              const start = performance.now();
              await userModel.findOne({ email: `mixed-seed-${i % 100}@test.com` });
              readLatencies.push(performance.now() - start);
            })(),
          );
        } else {
          // Write
          operations.push(
            (async () => {
              const start = performance.now();
              await userModel.create({
                email: `mixed-new-${i}@test.com`,
                passwordHash: `newhash${i}`,
              });
              writeLatencies.push(performance.now() - start);
            })(),
          );
        }
      }

      await Promise.all(operations);

      const readMetrics = calculateLoadMetrics(readLatencies);
      const writeMetrics = calculateLoadMetrics(writeLatencies);

      logLoadMetrics('Mixed Workload - Reads (70%)', readMetrics);
      logLoadMetrics('Mixed Workload - Writes (30%)', writeMetrics);

      // mongodb-memory-server is slower than real MongoDB
      expect(readMetrics.p95LatencyMs).toBeLessThan(2000);
      expect(writeMetrics.p95LatencyMs).toBeLessThan(2000);
    });

    it('should handle update-heavy workload', async () => {
      // Create users to update
      const users = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          userModel.create({
            email: `update-load-${i}@test.com`,
            passwordHash: `hash${i}`,
          }),
        ),
      );

      const latencies: number[] = [];
      const operations = users.flatMap((user) =>
        Array.from({ length: 10 }, async (_, i) => {
          const start = performance.now();
          await userModel.findByIdAndUpdate(user._id, {
            passwordHash: `updated-${i}`,
          });
          latencies.push(performance.now() - start);
        }),
      );

      await Promise.all(operations);

      const metrics = calculateLoadMetrics(latencies);
      logLoadMetrics('500 Concurrent Updates', metrics);

      // mongodb-memory-server is slower than real MongoDB
      expect(metrics.p95LatencyMs).toBeLessThan(5000);
    });
  });

  describe('UserService Load Tests', () => {
    it('should handle 50 concurrent user registrations through service', async () => {
      const latencies: number[] = [];
      const operations = Array.from({ length: 50 }, async (_, i) => {
        const start = performance.now();
        await userService.create({
          email: `service-load-${i}@test.com`,
          password: 'Password123',
        });
        latencies.push(performance.now() - start);
      });

      await Promise.all(operations);

      const metrics = calculateLoadMetrics(latencies);
      logLoadMetrics('50 Concurrent Service Creates', metrics);

      // bcrypt is slow, so allow higher latency
      expect(metrics.p95LatencyMs).toBeLessThan(2000);
    });

    it('should benefit from caching on repeated lookups', async () => {
      // Create users
      const users = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          userService.create({
            email: `cache-load-${i}@test.com`,
            password: 'Password123',
          }),
        ),
      );

      // Clear cache for cold start
      cacheService.clearAll();

      // Cold lookups
      const coldLatencies: number[] = [];
      for (const user of users) {
        const start = performance.now();
        await userService.findById(user.id);
        coldLatencies.push(performance.now() - start);
      }

      // Warm lookups (cached)
      const warmLatencies: number[] = [];
      for (const user of users) {
        const start = performance.now();
        await userService.findById(user.id);
        warmLatencies.push(performance.now() - start);
      }

      const coldMetrics = calculateLoadMetrics(coldLatencies);
      const warmMetrics = calculateLoadMetrics(warmLatencies);

      logLoadMetrics('Cold Lookups (Cache Miss)', coldMetrics);
      logLoadMetrics('Warm Lookups (Cache Hit)', warmMetrics);

      // Warm should be faster
      expect(warmMetrics.avgLatencyMs).toBeLessThan(coldMetrics.avgLatencyMs);
    });
  });

  describe('Sustained Load', () => {
    it('should maintain performance under sustained 10-second load', async () => {
      const durationMs = 10000;
      const latencies: number[] = [];
      const startTime = Date.now();
      let counter = 0;

      while (Date.now() - startTime < durationMs) {
        const start = performance.now();
        await userModel.create({
          email: `sustained-${counter}@test.com`,
          passwordHash: `hash${counter}`,
        });
        latencies.push(performance.now() - start);
        counter++;
      }

      const metrics = calculateLoadMetrics(latencies);
      logLoadMetrics(`Sustained Load (${durationMs}ms)`, metrics);

      console.log(`   Total operations: ${counter}`);
      console.log(`   Actual duration: ${Date.now() - startTime}ms`);

      // Should maintain reasonable performance throughout
      expect(metrics.p99LatencyMs).toBeLessThan(500);
    });
  });

  describe('Connection Pool Performance', () => {
    it('should handle rapid connection usage', async () => {
      const latencies: number[] = [];

      // Rapid operations that stress connection pool
      for (let batch = 0; batch < 10; batch++) {
        const batchOps = Array.from({ length: 50 }, async (_, i) => {
          const start = performance.now();
          await userModel.findOne({
            email: `nonexistent-${batch}-${i}@test.com`,
          });
          latencies.push(performance.now() - start);
        });

        await Promise.all(batchOps);
      }

      const metrics = calculateLoadMetrics(latencies);
      logLoadMetrics('Connection Pool Stress (500 ops)', metrics);

      // mongodb-memory-server is slower than real MongoDB
      expect(metrics.p95LatencyMs).toBeLessThan(1000);
    });
  });

  describe('Delete Operations Under Load', () => {
    it('should handle bulk deletes efficiently', async () => {
      // Create 500 users
      const users = Array.from({ length: 500 }, (_, i) => ({
        email: `delete-load-${i}@test.com`,
        passwordHash: `hash${i}`,
      }));
      await userModel.insertMany(users);

      const latencies: number[] = [];

      // Delete in batches
      for (let batch = 0; batch < 10; batch++) {
        const start = performance.now();
        await userModel.deleteMany({
          email: { $regex: `^delete-load-${batch}` },
        });
        latencies.push(performance.now() - start);
      }

      const metrics = calculateLoadMetrics(latencies);
      logLoadMetrics('Batch Deletes (10 batches)', metrics);

      const remaining = await userModel.countDocuments({});
      console.log(`   Remaining documents: ${remaining}`);

      expect(metrics.avgLatencyMs).toBeLessThan(100);
    });
  });
});
