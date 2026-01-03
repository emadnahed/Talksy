import { Test, TestingModule } from '@nestjs/testing';
import { InMemoryStorageAdapter } from './in-memory-storage.adapter';
import { Session } from '@/session/interfaces/session.interface';

describe('InMemoryStorageAdapter', () => {
  let adapter: InMemoryStorageAdapter;

  const createMockSession = (id: string): Session => ({
    id,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    expiresAt: new Date(Date.now() + 900000),
    status: 'active',
    conversationHistory: [],
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InMemoryStorageAdapter],
    }).compile();

    adapter = module.get<InMemoryStorageAdapter>(InMemoryStorageAdapter);
  });

  afterEach(async () => {
    await adapter.clear();
    adapter.onModuleDestroy();
  });

  describe('get', () => {
    it('should return null for non-existent key', async () => {
      const result = await adapter.get('non-existent');
      expect(result).toBeNull();
    });

    it('should return session for existing key', async () => {
      const session = createMockSession('test-1');
      await adapter.set('test-1', session);

      const result = await adapter.get('test-1');
      expect(result).toEqual(session);
    });

    it('should return null for expired session', async () => {
      jest.useFakeTimers();

      const session = createMockSession('test-1');
      await adapter.set('test-1', session, 1000);

      jest.advanceTimersByTime(1500);

      const result = await adapter.get('test-1');
      expect(result).toBeNull();

      jest.useRealTimers();
    });
  });

  describe('set', () => {
    it('should store a session', async () => {
      const session = createMockSession('test-1');
      await adapter.set('test-1', session);

      expect(await adapter.has('test-1')).toBe(true);
    });

    it('should store a session with TTL', async () => {
      jest.useFakeTimers();

      const session = createMockSession('test-1');
      await adapter.set('test-1', session, 1000);

      expect(await adapter.has('test-1')).toBe(true);

      jest.advanceTimersByTime(1500);

      expect(await adapter.has('test-1')).toBe(false);

      jest.useRealTimers();
    });

    it('should overwrite existing session and clear old timer', async () => {
      jest.useFakeTimers();

      const session1 = createMockSession('test-1');
      const session2 = createMockSession('test-1');
      session2.status = 'disconnected';

      await adapter.set('test-1', session1, 1000);
      await adapter.set('test-1', session2, 5000);

      jest.advanceTimersByTime(2000);

      // Session should still exist because new TTL is 5000ms
      const result = await adapter.get('test-1');
      expect(result?.status).toBe('disconnected');

      jest.useRealTimers();
    });
  });

  describe('delete', () => {
    it('should return false for non-existent key', async () => {
      const result = await adapter.delete('non-existent');
      expect(result).toBe(false);
    });

    it('should delete existing session and return true', async () => {
      const session = createMockSession('test-1');
      await adapter.set('test-1', session);

      const result = await adapter.delete('test-1');
      expect(result).toBe(true);
      expect(await adapter.has('test-1')).toBe(false);
    });

    it('should clear timer when deleting session with TTL', async () => {
      jest.useFakeTimers();

      const session = createMockSession('test-1');
      await adapter.set('test-1', session, 1000);

      await adapter.delete('test-1');

      // Advance past TTL - should not throw any errors
      jest.advanceTimersByTime(2000);

      jest.useRealTimers();
    });
  });

  describe('has', () => {
    it('should return false for non-existent key', async () => {
      const result = await adapter.has('non-existent');
      expect(result).toBe(false);
    });

    it('should return true for existing key', async () => {
      const session = createMockSession('test-1');
      await adapter.set('test-1', session);

      const result = await adapter.has('test-1');
      expect(result).toBe(true);
    });

    it('should return false for expired key', async () => {
      jest.useFakeTimers();

      const session = createMockSession('test-1');
      await adapter.set('test-1', session, 1000);

      jest.advanceTimersByTime(1500);

      const result = await adapter.has('test-1');
      expect(result).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('keys', () => {
    it('should return empty array when no sessions', async () => {
      const result = await adapter.keys();
      expect(result).toEqual([]);
    });

    it('should return all valid keys', async () => {
      await adapter.set('test-1', createMockSession('test-1'));
      await adapter.set('test-2', createMockSession('test-2'));
      await adapter.set('test-3', createMockSession('test-3'));

      const result = await adapter.keys();
      expect(result).toHaveLength(3);
      expect(result).toContain('test-1');
      expect(result).toContain('test-2');
      expect(result).toContain('test-3');
    });

    it('should exclude expired keys', async () => {
      jest.useFakeTimers();

      await adapter.set('test-1', createMockSession('test-1'), 1000);
      await adapter.set('test-2', createMockSession('test-2'));

      jest.advanceTimersByTime(1500);

      const result = await adapter.keys();
      expect(result).toEqual(['test-2']);

      jest.useRealTimers();
    });
  });

  describe('clear', () => {
    it('should clear all sessions', async () => {
      await adapter.set('test-1', createMockSession('test-1'));
      await adapter.set('test-2', createMockSession('test-2'));

      await adapter.clear();

      expect(await adapter.count()).toBe(0);
    });

    it('should clear all timers', async () => {
      jest.useFakeTimers();

      await adapter.set('test-1', createMockSession('test-1'), 1000);
      await adapter.set('test-2', createMockSession('test-2'), 2000);

      await adapter.clear();

      // Advance past all TTLs - should not throw
      jest.advanceTimersByTime(5000);

      expect(await adapter.count()).toBe(0);

      jest.useRealTimers();
    });
  });

  describe('count', () => {
    it('should return 0 when no sessions', async () => {
      const result = await adapter.count();
      expect(result).toBe(0);
    });

    it('should return correct count', async () => {
      await adapter.set('test-1', createMockSession('test-1'));
      await adapter.set('test-2', createMockSession('test-2'));

      const result = await adapter.count();
      expect(result).toBe(2);
    });

    it('should exclude expired sessions from count', async () => {
      jest.useFakeTimers();

      await adapter.set('test-1', createMockSession('test-1'), 1000);
      await adapter.set('test-2', createMockSession('test-2'));

      jest.advanceTimersByTime(1500);

      const result = await adapter.count();
      expect(result).toBe(1);

      jest.useRealTimers();
    });
  });

  describe('isHealthy', () => {
    it('should always return true for in-memory storage', async () => {
      const result = await adapter.isHealthy();
      expect(result).toBe(true);
    });
  });

  describe('getType', () => {
    it('should return in-memory', () => {
      expect(adapter.getType()).toBe('in-memory');
    });
  });

  describe('onModuleDestroy', () => {
    it('should clear all timers and sessions on destroy', async () => {
      jest.useFakeTimers();

      await adapter.set('test-1', createMockSession('test-1'), 10000);
      await adapter.set('test-2', createMockSession('test-2'), 20000);

      adapter.onModuleDestroy();

      // Advance time - timers should be cleared so no errors
      jest.advanceTimersByTime(30000);

      jest.useRealTimers();
    });
  });

  describe('concurrent access', () => {
    it('should handle concurrent reads and writes', async () => {
      const operations = [];

      for (let i = 0; i < 100; i++) {
        operations.push(adapter.set(`key-${i}`, createMockSession(`key-${i}`)));
      }

      await Promise.all(operations);

      const count = await adapter.count();
      expect(count).toBe(100);

      const readOperations = [];
      for (let i = 0; i < 100; i++) {
        readOperations.push(adapter.get(`key-${i}`));
      }

      const results = await Promise.all(readOperations);
      expect(results.every((r) => r !== null)).toBe(true);
    });
  });
});
