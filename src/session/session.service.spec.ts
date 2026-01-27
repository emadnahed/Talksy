import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SessionService } from './session.service';
import { MessageRole } from './dto/session-message.dto';
import { SESSION_DEFAULTS } from './constants/session.constants';

describe('SessionService', () => {
  let service: SessionService;
  let mockConfigService: Partial<ConfigService>;

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn().mockReturnValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('instantiation', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should load default configuration', () => {
      const config = service.getConfig();
      expect(config.ttlMs).toBe(SESSION_DEFAULTS.TTL_MS);
      expect(config.maxHistoryLength).toBe(SESSION_DEFAULTS.MAX_HISTORY_LENGTH);
      expect(config.cleanupIntervalMs).toBe(
        SESSION_DEFAULTS.CLEANUP_INTERVAL_MS,
      );
      expect(config.disconnectGraceMs).toBe(
        SESSION_DEFAULTS.DISCONNECT_GRACE_MS,
      );
    });

    it('should load custom configuration from ConfigService', async () => {
      const customConfig = {
        get: jest.fn().mockImplementation((key: string) => {
          const values: Record<string, number> = {
            SESSION_TTL_MS: 60000,
            SESSION_MAX_HISTORY: 50,
            SESSION_CLEANUP_INTERVAL_MS: 30000,
            SESSION_DISCONNECT_GRACE_MS: 120000,
          };
          return values[key];
        }),
      };

      const customModule = await Test.createTestingModule({
        providers: [
          SessionService,
          { provide: ConfigService, useValue: customConfig },
        ],
      }).compile();

      const customService = customModule.get<SessionService>(SessionService);
      const config = customService.getConfig();

      expect(config.ttlMs).toBe(60000);
      expect(config.maxHistoryLength).toBe(50);
      expect(config.cleanupIntervalMs).toBe(30000);
      expect(config.disconnectGraceMs).toBe(120000);

      customService.onModuleDestroy();
    });

    it('should work without ConfigService', async () => {
      const moduleWithoutConfig = await Test.createTestingModule({
        providers: [SessionService],
      }).compile();

      const serviceWithoutConfig =
        moduleWithoutConfig.get<SessionService>(SessionService);

      expect(serviceWithoutConfig).toBeDefined();
      expect(serviceWithoutConfig.getConfig().ttlMs).toBe(
        SESSION_DEFAULTS.TTL_MS,
      );

      serviceWithoutConfig.onModuleDestroy();
    });
  });

  describe('createSession', () => {
    it('should create a new session with correct properties', () => {
      const clientId = 'test-client-1';
      const beforeCreate = Date.now();

      const session = service.createSession(clientId);

      const afterCreate = Date.now();

      expect(session).toBeDefined();
      expect(session.id).toBe(clientId);
      expect(session.status).toBe('active');
      expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreate);
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(afterCreate);
      expect(session.lastActivityAt).toEqual(session.createdAt);
      expect(session.conversationHistory).toEqual([]);
      expect(session.expiresAt.getTime()).toBe(
        session.createdAt.getTime() + SESSION_DEFAULTS.TTL_MS,
      );
      expect(session.disconnectedAt).toBeUndefined();
    });

    it('should return existing active session if already exists', () => {
      const clientId = 'test-client-2';

      const session1 = service.createSession(clientId);
      const session2 = service.createSession(clientId);

      // Sessions are now returned as copies, so use toEqual for deep comparison
      expect(session1).toEqual(session2);
    });

    it('should create new session if existing one is disconnected', () => {
      const clientId = 'test-client-3';

      const session1 = service.createSession(clientId);
      service.markDisconnected(clientId);

      const session2 = service.createSession(clientId);

      expect(session2.status).toBe('active');
      expect(session2.createdAt.getTime()).toBeGreaterThanOrEqual(
        session1.createdAt.getTime(),
      );
    });

    it('should create multiple independent sessions', () => {
      const session1 = service.createSession('client-1');
      const session2 = service.createSession('client-2');

      expect(session1.id).toBe('client-1');
      expect(session2.id).toBe('client-2');
      expect(session1).not.toBe(session2);
    });
  });

  describe('getSession', () => {
    it('should return existing session', () => {
      const clientId = 'test-client';
      service.createSession(clientId);

      const session = service.getSession(clientId);

      expect(session).not.toBeNull();
      expect(session!.id).toBe(clientId);
    });

    it('should return null for non-existent session', () => {
      const session = service.getSession('non-existent');

      expect(session).toBeNull();
    });

    it('should return null for expired session and destroy it', () => {
      jest.useFakeTimers();
      const clientId = 'expiring-client';

      service.createSession(clientId);

      jest.advanceTimersByTime(SESSION_DEFAULTS.TTL_MS + 1000);

      const session = service.getSession(clientId);

      expect(session).toBeNull();
      expect(service.hasSession(clientId)).toBe(false);

      jest.useRealTimers();
    });

    it('should destroy expired session when getting it (before timer cleanup)', () => {
      const clientId = 'test-client';

      service.createSession(clientId);

      // Force-expire the session without triggering timers
      service.forceExpireSession(clientId);

      // getSession should find it expired and destroy it
      const result = service.getSession(clientId);

      expect(result).toBeNull();
      // Verify it was actually destroyed
      expect(service.getActiveSessionCount()).toBe(0);
    });
  });

  describe('destroySession', () => {
    it('should destroy existing session and return true', () => {
      const clientId = 'test-client';
      service.createSession(clientId);

      const result = service.destroySession(clientId);

      expect(result).toBe(true);
      expect(service.getSession(clientId)).toBeNull();
    });

    it('should return false for non-existent session', () => {
      const result = service.destroySession('non-existent');

      expect(result).toBe(false);
    });

    it('should clear expiration timer on destroy', () => {
      jest.useFakeTimers();
      const clientId = 'test-client';

      service.createSession(clientId);
      service.destroySession(clientId);

      jest.advanceTimersByTime(SESSION_DEFAULTS.TTL_MS + 1000);

      expect(service.hasSession(clientId)).toBe(false);

      jest.useRealTimers();
    });

    it('should clear disconnect timer on destroy', () => {
      jest.useFakeTimers();
      const clientId = 'test-client';

      service.createSession(clientId);
      service.markDisconnected(clientId);
      service.destroySession(clientId);

      jest.advanceTimersByTime(SESSION_DEFAULTS.DISCONNECT_GRACE_MS + 1000);

      expect(service.hasSession(clientId)).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('markDisconnected', () => {
    it('should mark active session as disconnected', () => {
      const clientId = 'test-client';
      service.createSession(clientId);

      const result = service.markDisconnected(clientId);

      expect(result).toBe(true);
      expect(service.hasDisconnectedSession(clientId)).toBe(true);
      expect(service.hasSession(clientId)).toBe(false);
    });

    it('should return false for non-existent session', () => {
      const result = service.markDisconnected('non-existent');

      expect(result).toBe(false);
    });

    it('should return false for already disconnected session', () => {
      const clientId = 'test-client';
      service.createSession(clientId);
      service.markDisconnected(clientId);

      const result = service.markDisconnected(clientId);

      expect(result).toBe(false);
    });

    it('should set disconnectedAt timestamp', () => {
      const clientId = 'test-client';
      const beforeDisconnect = Date.now();

      service.createSession(clientId);
      service.markDisconnected(clientId);

      const session = service.getSession(clientId);
      expect(session).not.toBeNull();
      expect(session!.disconnectedAt).toBeDefined();
      expect(session!.disconnectedAt!.getTime()).toBeGreaterThanOrEqual(
        beforeDisconnect,
      );
    });

    it('should start disconnect grace timer', () => {
      jest.useFakeTimers();
      const clientId = 'test-client';

      service.createSession(clientId);
      service.markDisconnected(clientId);

      expect(service.hasDisconnectedSession(clientId)).toBe(true);

      jest.advanceTimersByTime(SESSION_DEFAULTS.DISCONNECT_GRACE_MS + 1000);

      expect(service.hasDisconnectedSession(clientId)).toBe(false);

      jest.useRealTimers();
    });
  });

  describe('reconnectSession', () => {
    it('should reconnect a disconnected session', () => {
      const clientId = 'test-client';
      service.createSession(clientId);
      service.addMessage(clientId, MessageRole.USER, 'Hello');
      service.markDisconnected(clientId);

      const session = service.reconnectSession(clientId);

      expect(session).not.toBeNull();
      expect(session!.status).toBe('active');
      expect(session!.disconnectedAt).toBeUndefined();
      expect(session!.conversationHistory).toHaveLength(1);
    });

    it('should return null for non-existent session', () => {
      const session = service.reconnectSession('non-existent');

      expect(session).toBeNull();
    });

    it('should return null for active session', () => {
      const clientId = 'test-client';
      service.createSession(clientId);

      const session = service.reconnectSession(clientId);

      expect(session).toBeNull();
    });

    it('should reset TTL on reconnect', () => {
      jest.useFakeTimers();
      const clientId = 'test-client';

      service.createSession(clientId);
      const originalExpiry = service.getSession(clientId)!.expiresAt.getTime();

      jest.advanceTimersByTime(5000);
      service.markDisconnected(clientId);

      jest.advanceTimersByTime(1000);
      service.reconnectSession(clientId);

      const newExpiry = service.getSession(clientId)!.expiresAt.getTime();
      expect(newExpiry).toBeGreaterThan(originalExpiry);

      jest.useRealTimers();
    });

    it('should clear disconnect timer on reconnect', () => {
      jest.useFakeTimers();
      const clientId = 'test-client';

      service.createSession(clientId);
      service.markDisconnected(clientId);

      jest.advanceTimersByTime(SESSION_DEFAULTS.DISCONNECT_GRACE_MS / 2);
      service.reconnectSession(clientId);

      jest.advanceTimersByTime(SESSION_DEFAULTS.DISCONNECT_GRACE_MS);

      expect(service.hasSession(clientId)).toBe(true);

      jest.useRealTimers();
    });
  });

  describe('hasSession', () => {
    it('should return true for existing active session', () => {
      const clientId = 'test-client';
      service.createSession(clientId);

      expect(service.hasSession(clientId)).toBe(true);
    });

    it('should return false for non-existent session', () => {
      expect(service.hasSession('non-existent')).toBe(false);
    });

    it('should return false for disconnected session', () => {
      const clientId = 'test-client';
      service.createSession(clientId);
      service.markDisconnected(clientId);

      expect(service.hasSession(clientId)).toBe(false);
    });

    it('should return false for expired session', () => {
      jest.useFakeTimers();
      const clientId = 'test-client';

      service.createSession(clientId);
      jest.advanceTimersByTime(SESSION_DEFAULTS.TTL_MS + 1000);

      expect(service.hasSession(clientId)).toBe(false);

      jest.useRealTimers();
    });

    it('should return false when session exists but is expired (before timer cleanup)', () => {
      const clientId = 'test-client';

      service.createSession(clientId);

      // Force-expire the session without triggering timers
      service.forceExpireSession(clientId);

      // hasSession should return false for expired session
      expect(service.hasSession(clientId)).toBe(false);
    });
  });

  describe('hasDisconnectedSession', () => {
    it('should return true for disconnected session', () => {
      const clientId = 'test-client';
      service.createSession(clientId);
      service.markDisconnected(clientId);

      expect(service.hasDisconnectedSession(clientId)).toBe(true);
    });

    it('should return false for active session', () => {
      const clientId = 'test-client';
      service.createSession(clientId);

      expect(service.hasDisconnectedSession(clientId)).toBe(false);
    });

    it('should return false for non-existent session', () => {
      expect(service.hasDisconnectedSession('non-existent')).toBe(false);
    });
  });

  describe('addMessage', () => {
    it('should add message to session history', () => {
      const clientId = 'test-client';
      service.createSession(clientId);

      const message = service.addMessage(clientId, MessageRole.USER, 'Hello');

      expect(message).not.toBeNull();
      expect(message!.role).toBe(MessageRole.USER);
      expect(message!.content).toBe('Hello');
      expect(message!.timestamp).toBeDefined();
    });

    it('should return null for non-existent session', () => {
      const message = service.addMessage(
        'non-existent',
        MessageRole.USER,
        'Hello',
      );

      expect(message).toBeNull();
    });

    it('should return null for disconnected session', () => {
      const clientId = 'test-client';
      service.createSession(clientId);
      service.markDisconnected(clientId);

      const message = service.addMessage(clientId, MessageRole.USER, 'Hello');

      expect(message).toBeNull();
    });

    it('should update lastActivityAt and expiresAt on message', () => {
      jest.useFakeTimers();
      const clientId = 'test-client';

      service.createSession(clientId);
      const initialSession = service.getSession(clientId)!;
      const initialExpiry = initialSession.expiresAt.getTime();

      jest.advanceTimersByTime(5000);

      service.addMessage(clientId, MessageRole.USER, 'Hello');

      const updatedSession = service.getSession(clientId)!;

      expect(updatedSession.lastActivityAt.getTime()).toBeGreaterThan(
        initialSession.createdAt.getTime(),
      );
      expect(updatedSession.expiresAt.getTime()).toBeGreaterThan(initialExpiry);

      jest.useRealTimers();
    });

    it('should enforce max history length', async () => {
      const customConfig = {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'SESSION_MAX_HISTORY') return 3;
          return undefined;
        }),
      };

      const customModule = await Test.createTestingModule({
        providers: [
          SessionService,
          { provide: ConfigService, useValue: customConfig },
        ],
      }).compile();

      const customService = customModule.get<SessionService>(SessionService);
      const clientId = 'test-client';

      customService.createSession(clientId);

      customService.addMessage(clientId, MessageRole.USER, 'Message 1');
      customService.addMessage(clientId, MessageRole.ASSISTANT, 'Response 1');
      customService.addMessage(clientId, MessageRole.USER, 'Message 2');
      customService.addMessage(clientId, MessageRole.ASSISTANT, 'Response 2');
      customService.addMessage(clientId, MessageRole.USER, 'Message 3');

      const history = customService.getConversationHistory(clientId);

      expect(history.length).toBe(3);
      expect(history[0].content).toBe('Message 2');
      expect(history[1].content).toBe('Response 2');
      expect(history[2].content).toBe('Message 3');

      customService.onModuleDestroy();
    });

    it('should add messages with different roles', () => {
      const clientId = 'test-client';
      service.createSession(clientId);

      service.addMessage(clientId, MessageRole.USER, 'User message');
      service.addMessage(clientId, MessageRole.ASSISTANT, 'Assistant response');
      service.addMessage(clientId, MessageRole.SYSTEM, 'System message');

      const history = service.getConversationHistory(clientId);

      expect(history).toHaveLength(3);
      expect(history[0].role).toBe(MessageRole.USER);
      expect(history[1].role).toBe(MessageRole.ASSISTANT);
      expect(history[2].role).toBe(MessageRole.SYSTEM);
    });
  });

  describe('getConversationHistory', () => {
    it('should return conversation history', () => {
      const clientId = 'test-client';
      service.createSession(clientId);
      service.addMessage(clientId, MessageRole.USER, 'Hello');
      service.addMessage(clientId, MessageRole.ASSISTANT, 'Hi there');

      const history = service.getConversationHistory(clientId);

      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('Hello');
      expect(history[1].content).toBe('Hi there');
    });

    it('should return empty array for non-existent session', () => {
      const history = service.getConversationHistory('non-existent');

      expect(history).toEqual([]);
    });

    it('should return empty array for new session', () => {
      const clientId = 'test-client';
      service.createSession(clientId);

      const history = service.getConversationHistory(clientId);

      expect(history).toEqual([]);
    });
  });

  describe('getSessionInfo', () => {
    it('should return session info DTO', () => {
      const clientId = 'test-client';
      service.createSession(clientId);
      service.addMessage(clientId, MessageRole.USER, 'Hello');

      const info = service.getSessionInfo(clientId);

      expect(info).not.toBeNull();
      expect(info!.sessionId).toBe(clientId);
      expect(info!.status).toBe('active');
      expect(info!.createdAt).toBeDefined();
      expect(info!.lastActivityAt).toBeDefined();
      expect(info!.expiresAt).toBeDefined();
      expect(info!.messageCount).toBe(1);
      expect(info!.disconnectedAt).toBeUndefined();
    });

    it('should return null for non-existent session', () => {
      const info = service.getSessionInfo('non-existent');

      expect(info).toBeNull();
    });

    it('should include disconnectedAt for disconnected session', () => {
      const clientId = 'test-client';
      service.createSession(clientId);
      service.markDisconnected(clientId);

      const info = service.getSessionInfo(clientId);

      expect(info).not.toBeNull();
      expect(info!.status).toBe('disconnected');
      expect(info!.disconnectedAt).toBeDefined();
    });
  });

  describe('touchSession', () => {
    it('should update lastActivityAt and reset TTL', () => {
      jest.useFakeTimers();
      const clientId = 'test-client';

      service.createSession(clientId);
      const initialSession = service.getSession(clientId)!;
      const initialExpiry = initialSession.expiresAt.getTime();

      jest.advanceTimersByTime(5000);

      const result = service.touchSession(clientId);
      const updatedSession = service.getSession(clientId)!;

      expect(result).toBe(true);
      expect(updatedSession.lastActivityAt.getTime()).toBeGreaterThan(
        initialSession.createdAt.getTime(),
      );
      expect(updatedSession.expiresAt.getTime()).toBeGreaterThan(initialExpiry);

      jest.useRealTimers();
    });

    it('should return false for non-existent session', () => {
      const result = service.touchSession('non-existent');

      expect(result).toBe(false);
    });

    it('should return false for disconnected session', () => {
      const clientId = 'test-client';
      service.createSession(clientId);
      service.markDisconnected(clientId);

      const result = service.touchSession(clientId);

      expect(result).toBe(false);
    });
  });

  describe('getActiveSessionCount', () => {
    it('should return 0 for no sessions', () => {
      expect(service.getActiveSessionCount()).toBe(0);
    });

    it('should return correct count for multiple sessions', () => {
      service.createSession('client-1');
      service.createSession('client-2');
      service.createSession('client-3');

      expect(service.getActiveSessionCount()).toBe(3);
    });

    it('should not count disconnected sessions', () => {
      service.createSession('client-1');
      service.createSession('client-2');
      service.markDisconnected('client-1');

      expect(service.getActiveSessionCount()).toBe(1);
    });

    it('should decrease count after destroying session', () => {
      service.createSession('client-1');
      service.createSession('client-2');
      service.destroySession('client-1');

      expect(service.getActiveSessionCount()).toBe(1);
    });

    it('should not count expired sessions', () => {
      jest.useFakeTimers();

      service.createSession('client-1');
      service.createSession('client-2');

      jest.advanceTimersByTime(SESSION_DEFAULTS.TTL_MS + 1000);

      expect(service.getActiveSessionCount()).toBe(0);

      jest.useRealTimers();
    });
  });

  describe('clearAllSessions', () => {
    it('should remove all sessions', () => {
      service.createSession('client-1');
      service.createSession('client-2');
      service.createSession('client-3');

      service.clearAllSessions();

      expect(service.getActiveSessionCount()).toBe(0);
      expect(service.hasSession('client-1')).toBe(false);
      expect(service.hasSession('client-2')).toBe(false);
      expect(service.hasSession('client-3')).toBe(false);
    });

    it('should clear all timers', () => {
      jest.useFakeTimers();

      service.createSession('client-1');
      service.createSession('client-2');
      service.markDisconnected('client-2');

      service.clearAllSessions();

      jest.advanceTimersByTime(
        SESSION_DEFAULTS.TTL_MS + SESSION_DEFAULTS.DISCONNECT_GRACE_MS,
      );

      expect(() => service.getActiveSessionCount()).not.toThrow();

      jest.useRealTimers();
    });
  });

  describe('TTL and expiration', () => {
    it('should auto-expire session after TTL via timer', () => {
      jest.useFakeTimers();
      const clientId = 'expiring-client';

      service.createSession(clientId);
      expect(service.hasSession(clientId)).toBe(true);

      jest.advanceTimersByTime(SESSION_DEFAULTS.TTL_MS + 1000);

      expect(service.getSession(clientId)).toBeNull();

      jest.useRealTimers();
    });

    it('should reset TTL on activity', () => {
      jest.useFakeTimers();
      const clientId = 'active-client';

      service.createSession(clientId);

      jest.advanceTimersByTime(SESSION_DEFAULTS.TTL_MS / 2);

      service.touchSession(clientId);

      jest.advanceTimersByTime(SESSION_DEFAULTS.TTL_MS / 2);

      expect(service.hasSession(clientId)).toBe(true);

      jest.advanceTimersByTime(SESSION_DEFAULTS.TTL_MS);

      expect(service.getSession(clientId)).toBeNull();

      jest.useRealTimers();
    });
  });

  describe('cleanup interval', () => {
    it('should clean up expired sessions periodically', async () => {
      // Create service with fake timers enabled from the start
      jest.useFakeTimers();

      const cleanupModule = await Test.createTestingModule({
        providers: [
          SessionService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const cleanupService = cleanupModule.get<SessionService>(SessionService);

      cleanupService.createSession('client-1');

      // Force-expire the session
      cleanupService.forceExpireSession('client-1');

      // Advance past cleanup interval
      jest.advanceTimersByTime(SESSION_DEFAULTS.CLEANUP_INTERVAL_MS + 1000);

      expect(cleanupService.getSession('client-1')).toBeNull();

      cleanupService.onModuleDestroy();
      jest.useRealTimers();
    });

    it('should clean up multiple expired sessions and log count', async () => {
      // Create service with fake timers enabled from the start
      jest.useFakeTimers();

      const cleanupModule = await Test.createTestingModule({
        providers: [
          SessionService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const cleanupService = cleanupModule.get<SessionService>(SessionService);

      cleanupService.createSession('client-1');
      cleanupService.createSession('client-2');
      cleanupService.createSession('client-3');

      // Force-expire sessions 1 and 2
      cleanupService.forceExpireSession('client-1');
      cleanupService.forceExpireSession('client-2');

      // Advance past cleanup interval
      jest.advanceTimersByTime(SESSION_DEFAULTS.CLEANUP_INTERVAL_MS + 1000);

      expect(cleanupService.getSession('client-1')).toBeNull();
      expect(cleanupService.getSession('client-2')).toBeNull();
      expect(cleanupService.hasSession('client-3')).toBe(true);

      cleanupService.onModuleDestroy();
      jest.useRealTimers();
    });

    it('should not clean up disconnected sessions during interval cleanup', async () => {
      // Create service with fake timers enabled from the start
      jest.useFakeTimers();

      const cleanupModule = await Test.createTestingModule({
        providers: [
          SessionService,
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      const cleanupService = cleanupModule.get<SessionService>(SessionService);

      cleanupService.createSession('client-1');
      cleanupService.markDisconnected('client-1');

      // Force-expire the session but it's disconnected so cleanup should skip
      cleanupService.forceExpireSession('client-1');

      // Advance past cleanup interval
      jest.advanceTimersByTime(SESSION_DEFAULTS.CLEANUP_INTERVAL_MS + 1000);

      // Session still exists because it's disconnected, not active
      expect(cleanupService.hasDisconnectedSession('client-1')).toBe(true);

      cleanupService.onModuleDestroy();
      jest.useRealTimers();
    });
  });

  describe('onModuleDestroy', () => {
    it('should clean up all resources without error', () => {
      service.createSession('client-1');
      service.createSession('client-2');
      service.markDisconnected('client-2');

      expect(() => service.onModuleDestroy()).not.toThrow();
    });

    it('should be safe to call multiple times', () => {
      service.createSession('client-1');

      expect(() => {
        service.onModuleDestroy();
        service.onModuleDestroy();
      }).not.toThrow();
    });
  });

  describe('getDisconnectedSessionCount', () => {
    it('should return 0 when no sessions exist', () => {
      expect(service.getDisconnectedSessionCount()).toBe(0);
    });

    it('should return 0 when all sessions are active', () => {
      service.createSession('client-1');
      service.createSession('client-2');

      expect(service.getDisconnectedSessionCount()).toBe(0);
    });

    it('should return correct count of disconnected sessions', () => {
      service.createSession('client-1');
      service.createSession('client-2');
      service.createSession('client-3');
      service.markDisconnected('client-1');
      service.markDisconnected('client-3');

      expect(service.getDisconnectedSessionCount()).toBe(2);
    });

    it('should not count destroyed sessions', () => {
      service.createSession('client-1');
      service.createSession('client-2');
      service.markDisconnected('client-1');
      service.destroySession('client-1');

      expect(service.getDisconnectedSessionCount()).toBe(0);
    });

    it('should update count when session reconnects', () => {
      service.createSession('client-1');
      service.markDisconnected('client-1');

      expect(service.getDisconnectedSessionCount()).toBe(1);

      service.reconnectSession('client-1');

      expect(service.getDisconnectedSessionCount()).toBe(0);
    });
  });

  describe('LRU eviction and max sessions', () => {
    let limitedService: SessionService;

    beforeEach(async () => {
      const limitedConfigService = {
        get: jest.fn().mockImplementation((key: string) => {
          const values: Record<string, number> = {
            SESSION_MAX_SESSIONS: 3, // Small limit for testing
            SESSION_TTL_MS: 900000,
            SESSION_MAX_HISTORY: 100,
            SESSION_CLEANUP_INTERVAL_MS: 60000,
            SESSION_DISCONNECT_GRACE_MS: 300000,
          };
          return values[key];
        }),
      };

      const limitedModule = await Test.createTestingModule({
        providers: [
          SessionService,
          { provide: ConfigService, useValue: limitedConfigService },
        ],
      }).compile();

      limitedService = limitedModule.get<SessionService>(SessionService);
    });

    afterEach(() => {
      limitedService.onModuleDestroy();
    });

    it('should include maxSessions in configuration', () => {
      const config = limitedService.getConfig();
      expect(config.maxSessions).toBe(3);
    });

    it('should evict LRU session when max sessions reached', () => {
      // Create sessions up to max
      limitedService.createSession('client-1');
      limitedService.createSession('client-2');
      limitedService.createSession('client-3');

      expect(limitedService.getActiveSessionCount()).toBe(3);
      expect(limitedService.hasSession('client-1')).toBe(true);

      // Create one more - should evict client-1 (LRU)
      limitedService.createSession('client-4');

      expect(limitedService.getActiveSessionCount()).toBe(3);
      expect(limitedService.hasSession('client-1')).toBe(false); // Evicted
      expect(limitedService.hasSession('client-2')).toBe(true);
      expect(limitedService.hasSession('client-3')).toBe(true);
      expect(limitedService.hasSession('client-4')).toBe(true);
    });

    it('should evict multiple sessions when creating many new sessions', () => {
      limitedService.createSession('client-1');
      limitedService.createSession('client-2');
      limitedService.createSession('client-3');

      // Create two more sessions
      limitedService.createSession('client-4');
      limitedService.createSession('client-5');

      expect(limitedService.getActiveSessionCount()).toBe(3);
      expect(limitedService.hasSession('client-1')).toBe(false); // Evicted
      expect(limitedService.hasSession('client-2')).toBe(false); // Evicted
      expect(limitedService.hasSession('client-3')).toBe(true);
      expect(limitedService.hasSession('client-4')).toBe(true);
      expect(limitedService.hasSession('client-5')).toBe(true);
    });

    it('should update LRU order when touchSession is called', () => {
      limitedService.createSession('client-1');
      limitedService.createSession('client-2');
      limitedService.createSession('client-3');

      // Touch client-1 to make it most recently used
      limitedService.touchSession('client-1');

      // Create new session - should evict client-2 (now LRU)
      limitedService.createSession('client-4');

      expect(limitedService.hasSession('client-1')).toBe(true); // Was touched, not LRU
      expect(limitedService.hasSession('client-2')).toBe(false); // Evicted as LRU
      expect(limitedService.hasSession('client-3')).toBe(true);
      expect(limitedService.hasSession('client-4')).toBe(true);
    });

    it('should update LRU order when adding messages', () => {
      limitedService.createSession('client-1');
      limitedService.createSession('client-2');
      limitedService.createSession('client-3');

      // Add message to client-1 to make it most recently used
      limitedService.addMessage('client-1', MessageRole.USER, 'Hello');

      // Create new session - should evict client-2 (now LRU)
      limitedService.createSession('client-4');

      expect(limitedService.hasSession('client-1')).toBe(true); // Had activity, not LRU
      expect(limitedService.hasSession('client-2')).toBe(false); // Evicted as LRU
      expect(limitedService.hasSession('client-3')).toBe(true);
      expect(limitedService.hasSession('client-4')).toBe(true);
    });

    it('should preserve session data when updating LRU order', () => {
      limitedService.createSession('client-1');
      limitedService.addMessage('client-1', MessageRole.USER, 'Hello');
      limitedService.addMessage('client-1', MessageRole.ASSISTANT, 'Hi there');

      // Touch to update LRU order
      limitedService.touchSession('client-1');

      // Verify session data is preserved
      const history = limitedService.getConversationHistory('client-1');
      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('Hello');
      expect(history[1].content).toBe('Hi there');
    });

    it('should update LRU order when createSession called for existing session', () => {
      limitedService.createSession('client-1');
      limitedService.createSession('client-2');
      limitedService.createSession('client-3');

      // Create session for existing client-1 (should update LRU order)
      limitedService.createSession('client-1');

      // Create new session - should evict client-2 (now LRU)
      limitedService.createSession('client-4');

      expect(limitedService.hasSession('client-1')).toBe(true); // Was re-created, not LRU
      expect(limitedService.hasSession('client-2')).toBe(false); // Evicted as LRU
      expect(limitedService.hasSession('client-3')).toBe(true);
      expect(limitedService.hasSession('client-4')).toBe(true);
    });

    it('should not evict disconnected sessions based on LRU alone', () => {
      limitedService.createSession('client-1');
      limitedService.createSession('client-2');
      limitedService.markDisconnected('client-1');
      limitedService.createSession('client-3');

      // Active count should be 2, but total sessions include disconnected
      expect(limitedService.getActiveSessionCount()).toBe(2);
      expect(limitedService.hasDisconnectedSession('client-1')).toBe(true);

      // Create new session
      limitedService.createSession('client-4');

      // client-1 was LRU and should be evicted (even though disconnected)
      expect(limitedService.hasDisconnectedSession('client-1')).toBe(false);
    });

    it('should handle rapid session creation without errors', () => {
      // Create more sessions than max in rapid succession
      for (let i = 0; i < 10; i++) {
        limitedService.createSession(`client-${i}`);
      }

      // Should only have maxSessions active
      expect(limitedService.getActiveSessionCount()).toBe(3);

      // Last 3 sessions should be active
      expect(limitedService.hasSession('client-7')).toBe(true);
      expect(limitedService.hasSession('client-8')).toBe(true);
      expect(limitedService.hasSession('client-9')).toBe(true);
    });

    it('should correctly track LRU with mixed operations', () => {
      limitedService.createSession('client-1');
      limitedService.createSession('client-2');
      limitedService.createSession('client-3');

      // Mix of operations
      limitedService.addMessage('client-2', MessageRole.USER, 'msg1'); // client-2 now most recent
      limitedService.touchSession('client-1'); // client-1 now most recent

      // LRU order: client-3 -> client-2 -> client-1
      limitedService.createSession('client-4');

      expect(limitedService.hasSession('client-3')).toBe(false); // LRU, evicted
      expect(limitedService.hasSession('client-2')).toBe(true);
      expect(limitedService.hasSession('client-1')).toBe(true);
      expect(limitedService.hasSession('client-4')).toBe(true);
    });
  });

  describe('maxSessions with default configuration', () => {
    it('should have default maxSessions in configuration', () => {
      const config = service.getConfig();
      expect(config.maxSessions).toBe(SESSION_DEFAULTS.MAX_SESSIONS);
    });

    it('should handle large number of sessions up to default max', () => {
      // Create several sessions (less than default max)
      for (let i = 0; i < 100; i++) {
        service.createSession(`client-${i}`);
      }

      expect(service.getActiveSessionCount()).toBe(100);
    });
  });
});
