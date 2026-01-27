import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from '@/storage/storage.module';
import { StorageService } from '@/storage/storage.service';
import { RedisModule } from '@/redis/redis.module';
import { Session } from '@/session/interfaces/session.interface';
import { MessageRole } from '@/session/dto/session-message.dto';

describe('StorageModule Integration', () => {
  let module: TestingModule;
  let storageService: StorageService;

  const createMockSession = (id: string): Session => ({
    id,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    expiresAt: new Date(Date.now() + 900000),
    status: 'active',
    conversationHistory: [],
  });

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              REDIS_ENABLED: false, // Use in-memory storage
            }),
          ],
        }),
        RedisModule,
        StorageModule,
      ],
    }).compile();

    storageService = module.get<StorageService>(StorageService);
    await storageService.onModuleInit();
  });

  afterEach(async () => {
    await storageService.clear();
    await module.close();
  });

  describe('Module Integration', () => {
    it('should provide StorageService', () => {
      expect(storageService).toBeDefined();
      expect(storageService).toBeInstanceOf(StorageService);
    });

    it('should use in-memory storage by default', () => {
      expect(storageService.getType()).toBe('in-memory');
      expect(storageService.isUsingFallback()).toBe(false);
      expect(storageService.isUsingRedis()).toBe(false);
    });
  });

  describe('CRUD Operations', () => {
    it('should store and retrieve session', async () => {
      const session = createMockSession('crud-test-1');

      await storageService.set(session.id, session);
      const retrieved = await storageService.get(session.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(session.id);
      expect(retrieved!.status).toBe('active');
    });

    it('should return null for non-existent key', async () => {
      const result = await storageService.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should delete session', async () => {
      const session = createMockSession('crud-test-2');

      await storageService.set(session.id, session);
      expect(await storageService.has(session.id)).toBe(true);

      const deleted = await storageService.delete(session.id);
      expect(deleted).toBe(true);
      expect(await storageService.has(session.id)).toBe(false);
    });

    it('should return false when deleting non-existent key', async () => {
      const deleted = await storageService.delete('non-existent-key');
      expect(deleted).toBe(false);
    });

    it('should check existence with has()', async () => {
      const session = createMockSession('crud-test-3');

      expect(await storageService.has(session.id)).toBe(false);
      await storageService.set(session.id, session);
      expect(await storageService.has(session.id)).toBe(true);
    });
  });

  describe('Bulk Operations', () => {
    it('should count stored sessions', async () => {
      expect(await storageService.count()).toBe(0);

      await storageService.set('count-1', createMockSession('count-1'));
      expect(await storageService.count()).toBe(1);

      await storageService.set('count-2', createMockSession('count-2'));
      expect(await storageService.count()).toBe(2);
    });

    it('should list all keys', async () => {
      await storageService.set('keys-1', createMockSession('keys-1'));
      await storageService.set('keys-2', createMockSession('keys-2'));
      await storageService.set('keys-3', createMockSession('keys-3'));

      const keys = await storageService.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('keys-1');
      expect(keys).toContain('keys-2');
      expect(keys).toContain('keys-3');
    });

    it('should clear all sessions', async () => {
      await storageService.set('clear-1', createMockSession('clear-1'));
      await storageService.set('clear-2', createMockSession('clear-2'));

      expect(await storageService.count()).toBe(2);

      await storageService.clear();
      expect(await storageService.count()).toBe(0);
    });
  });

  describe('TTL Support', () => {
    it('should store session with TTL', async () => {
      const session = createMockSession('ttl-test-1');
      const ttlMs = 500; // 500ms

      await storageService.set(session.id, session, ttlMs);
      expect(await storageService.has(session.id)).toBe(true);
    });

    it('should expire session after TTL', async () => {
      const session = createMockSession('ttl-test-2');
      const ttlMs = 100; // 100ms

      await storageService.set(session.id, session, ttlMs);
      expect(await storageService.has(session.id)).toBe(true);

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(await storageService.has(session.id)).toBe(false);
    });
  });

  describe('Health Check', () => {
    it('should report healthy status', async () => {
      const isHealthy = await storageService.isHealthy();
      expect(isHealthy).toBe(true);
    });

    it('should return null latency for in-memory storage', async () => {
      const latency = await storageService.getRedisLatency();
      expect(latency).toBeNull();
    });
  });

  describe('Session Updates', () => {
    it('should update existing session', async () => {
      const session = createMockSession('update-test-1');
      await storageService.set(session.id, session);

      // Update session status
      session.status = 'disconnected';
      session.disconnectedAt = new Date();
      await storageService.set(session.id, session);

      const retrieved = await storageService.get(session.id);
      expect(retrieved!.status).toBe('disconnected');
      expect(retrieved!.disconnectedAt).toBeDefined();
    });

    it('should preserve conversation history', async () => {
      const session = createMockSession('update-test-2');
      session.conversationHistory = [
        { role: MessageRole.USER, content: 'Hello', timestamp: Date.now() },
        { role: MessageRole.ASSISTANT, content: 'Hi', timestamp: Date.now() },
      ];

      await storageService.set(session.id, session);
      const retrieved = await storageService.get(session.id);

      expect(retrieved!.conversationHistory).toHaveLength(2);
      expect(retrieved!.conversationHistory[0].content).toBe('Hello');
    });
  });

  describe('Multiple Sessions', () => {
    it('should handle many concurrent sessions', async () => {
      const sessions = Array.from({ length: 100 }, (_, i) =>
        createMockSession(`concurrent-${i}`),
      );

      // Store all sessions
      await Promise.all(
        sessions.map((session) => storageService.set(session.id, session)),
      );

      expect(await storageService.count()).toBe(100);

      // Retrieve random sessions
      const sample = [
        await storageService.get('concurrent-0'),
        await storageService.get('concurrent-50'),
        await storageService.get('concurrent-99'),
      ];

      expect(sample.every((s) => s !== null)).toBe(true);
    });

    it('should maintain isolation between sessions', async () => {
      const session1 = createMockSession('isolated-1');
      const session2 = createMockSession('isolated-2');

      session1.conversationHistory = [
        { role: MessageRole.USER, content: 'Session 1', timestamp: Date.now() },
      ];
      session2.conversationHistory = [
        { role: MessageRole.USER, content: 'Session 2', timestamp: Date.now() },
      ];

      await storageService.set(session1.id, session1);
      await storageService.set(session2.id, session2);

      const retrieved1 = await storageService.get(session1.id);
      const retrieved2 = await storageService.get(session2.id);

      expect(retrieved1!.conversationHistory[0].content).toBe('Session 1');
      expect(retrieved2!.conversationHistory[0].content).toBe('Session 2');
    });
  });
});
