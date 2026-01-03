import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SessionModule } from '@/session/session.module';
import { SessionService } from '@/session/session.service';
import { MessageRole } from '@/session/dto/session-message.dto';

describe('SessionModule Integration', () => {
  let module: TestingModule;
  let sessionService: SessionService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        SessionModule,
      ],
    }).compile();

    sessionService = module.get<SessionService>(SessionService);
  });

  afterEach(async () => {
    sessionService.clearAllSessions();
    sessionService.onModuleDestroy();
    await module.close();
  });

  describe('Module Integration', () => {
    it('should provide SessionService', () => {
      expect(sessionService).toBeDefined();
      expect(sessionService).toBeInstanceOf(SessionService);
    });

    it('should create and manage sessions', () => {
      const clientId = 'integration-test-client';

      const session = sessionService.createSession(clientId);
      expect(session).toBeDefined();
      expect(session.id).toBe(clientId);

      const retrieved = sessionService.getSession(clientId);
      expect(retrieved).toEqual(session);
    });

    it('should handle full session lifecycle', () => {
      const clientId = 'lifecycle-test-client';

      // Create
      const session = sessionService.createSession(clientId);
      expect(sessionService.hasSession(clientId)).toBe(true);
      expect(session.status).toBe('active');

      // Add messages
      sessionService.addMessage(clientId, MessageRole.USER, 'Hello');
      sessionService.addMessage(clientId, MessageRole.ASSISTANT, 'Hi there');

      const history = sessionService.getConversationHistory(clientId);
      expect(history).toHaveLength(2);

      // Get info
      const info = sessionService.getSessionInfo(clientId);
      expect(info).not.toBeNull();
      expect(info!.messageCount).toBe(2);

      // Destroy
      const destroyed = sessionService.destroySession(clientId);
      expect(destroyed).toBe(true);
      expect(sessionService.hasSession(clientId)).toBe(false);
    });

    it('should handle multiple concurrent sessions', () => {
      const clients = ['client-1', 'client-2', 'client-3'];

      // Create all sessions
      clients.forEach((clientId) => {
        sessionService.createSession(clientId);
        sessionService.addMessage(
          clientId,
          MessageRole.USER,
          `Hello from ${clientId}`,
        );
      });

      expect(sessionService.getActiveSessionCount()).toBe(3);

      // Verify each session is independent
      clients.forEach((clientId) => {
        const history = sessionService.getConversationHistory(clientId);
        expect(history).toHaveLength(1);
        expect(history[0].content).toBe(`Hello from ${clientId}`);
      });
    });

    it('should handle disconnect and reconnect flow', () => {
      const clientId = 'reconnect-test-client';

      // Create session and add message
      sessionService.createSession(clientId);
      sessionService.addMessage(
        clientId,
        MessageRole.USER,
        'Before disconnect',
      );

      // Disconnect
      sessionService.markDisconnected(clientId);
      expect(sessionService.hasSession(clientId)).toBe(false);
      expect(sessionService.hasDisconnectedSession(clientId)).toBe(true);

      // Reconnect
      const reconnectedSession = sessionService.reconnectSession(clientId);
      expect(reconnectedSession).not.toBeNull();
      expect(reconnectedSession!.status).toBe('active');

      // History should be preserved
      const history = sessionService.getConversationHistory(clientId);
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Before disconnect');
    });

    it('should maintain session isolation during concurrent operations', () => {
      const client1 = 'isolation-client-1';
      const client2 = 'isolation-client-2';

      sessionService.createSession(client1);
      sessionService.createSession(client2);

      // Add different messages to each
      sessionService.addMessage(
        client1,
        MessageRole.USER,
        'Message for client 1',
      );
      sessionService.addMessage(
        client2,
        MessageRole.USER,
        'Message for client 2',
      );
      sessionService.addMessage(
        client1,
        MessageRole.ASSISTANT,
        'Response for client 1',
      );

      // Verify isolation
      const history1 = sessionService.getConversationHistory(client1);
      const history2 = sessionService.getConversationHistory(client2);

      expect(history1).toHaveLength(2);
      expect(history2).toHaveLength(1);

      expect(history1[0].content).toBe('Message for client 1');
      expect(history2[0].content).toBe('Message for client 2');
    });

    it('should handle session expiration correctly', () => {
      jest.useFakeTimers();
      const clientId = 'expiring-client';

      sessionService.createSession(clientId);
      expect(sessionService.hasSession(clientId)).toBe(true);

      // Get TTL from config
      const config = sessionService.getConfig();

      // Advance past TTL
      jest.advanceTimersByTime(config.ttlMs + 1000);

      expect(sessionService.getSession(clientId)).toBeNull();

      jest.useRealTimers();
    });

    it('should clear all sessions correctly', () => {
      sessionService.createSession('client-1');
      sessionService.createSession('client-2');
      sessionService.markDisconnected('client-2');

      expect(sessionService.getActiveSessionCount()).toBe(1);

      sessionService.clearAllSessions();

      expect(sessionService.getActiveSessionCount()).toBe(0);
      expect(sessionService.hasSession('client-1')).toBe(false);
      expect(sessionService.hasDisconnectedSession('client-2')).toBe(false);
    });
  });
});
