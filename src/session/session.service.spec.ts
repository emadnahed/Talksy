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

      expect(session1).toBe(session2);
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

      // Manually expire the session without triggering timers
      const session = service.getSession(clientId)!;
      session.expiresAt = new Date(Date.now() - 1000);

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

      // Manually expire the session without triggering timers
      const session = service.getSession(clientId)!;
      session.expiresAt = new Date(Date.now() - 1000);

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

      // Manually expire the session by modifying expiresAt
      const session = cleanupService.getSession('client-1')!;
      session.expiresAt = new Date(Date.now() - 1000);

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

      // Manually expire sessions
      const session1 = cleanupService.getSession('client-1')!;
      const session2 = cleanupService.getSession('client-2')!;
      session1.expiresAt = new Date(Date.now() - 1000);
      session2.expiresAt = new Date(Date.now() - 1000);

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

      // Manually set expired time but it's disconnected so cleanup should skip
      const session = cleanupService.getSession('client-1')!;
      session.expiresAt = new Date(Date.now() - 1000);

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
});
