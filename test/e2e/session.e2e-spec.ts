import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '@/app.module';
import { SessionService } from '@/session/session.service';

describe('Session E2E', () => {
  let app: INestApplication;
  let clientSocket: Socket;
  let sessionService: SessionService;
  const port = 3002;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    sessionService = moduleFixture.get<SessionService>(SessionService);
    await app.listen(port);
  });

  afterAll(async () => {
    sessionService.clearAllSessions();
    await app.close();
  });

  beforeEach((done) => {
    clientSocket = io(`http://localhost:${port}`, {
      transports: ['websocket'],
      forceNew: true,
    });
    clientSocket.on('connect', () => {
      done();
    });
  });

  afterEach(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  describe('session creation on connection', () => {
    it('should receive session_created event on connection', (done) => {
      const newSocket = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      newSocket.on(
        'session_created',
        (data: { sessionId: string; expiresAt: string }) => {
          expect(data).toHaveProperty('sessionId');
          expect(data).toHaveProperty('expiresAt');
          expect(typeof data.sessionId).toBe('string');
          expect(typeof data.expiresAt).toBe('string');

          const expiresAt = new Date(data.expiresAt);
          expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

          newSocket.disconnect();
          done();
        },
      );
    });

    it('should include sessionId in connected event', (done) => {
      const newSocket = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      newSocket.on(
        'connected',
        (data: { clientId: string; sessionId: string }) => {
          expect(data).toHaveProperty('clientId');
          expect(data).toHaveProperty('sessionId');
          expect(data.clientId).toBe(data.sessionId);

          newSocket.disconnect();
          done();
        },
      );
    });
  });

  describe('conversation history', () => {
    it('should persist messages in session', (done) => {
      const messages = ['Hello', 'How are you?', 'Tell me a joke'];
      let messagesSent = 0;

      clientSocket.on('assistant_response', () => {
        messagesSent++;
        if (messagesSent === messages.length) {
          clientSocket.emit('get_history');
        }
      });

      clientSocket.on(
        'conversation_history',
        (data: {
          messages: Array<{
            role: string;
            content: string;
            timestamp: number;
          }>;
        }) => {
          expect(data.messages.length).toBe(messages.length * 2);

          const userMessages = data.messages.filter((m) => m.role === 'user');
          expect(userMessages.length).toBe(messages.length);

          done();
        },
      );

      messages.forEach((text) => {
        clientSocket.emit('user_message', { text });
      });
    });

    it('should return empty history for new connection', (done) => {
      clientSocket.on(
        'conversation_history',
        (data: { messages: unknown[] }) => {
          expect(data.messages).toEqual([]);
          done();
        },
      );

      clientSocket.emit('get_history');
    });
  });

  describe('session info', () => {
    it('should return valid session info', (done) => {
      clientSocket.on(
        'session_info',
        (data: {
          sessionId: string;
          status: string;
          createdAt: string;
          lastActivityAt: string;
          expiresAt: string;
          messageCount: number;
        }) => {
          expect(data.sessionId).toBeDefined();
          expect(data.status).toBe('active');
          expect(data.createdAt).toBeDefined();
          expect(data.lastActivityAt).toBeDefined();
          expect(data.expiresAt).toBeDefined();
          expect(typeof data.messageCount).toBe('number');

          done();
        },
      );

      clientSocket.emit('get_session_info');
    });

    it('should update messageCount after sending messages', (done) => {
      clientSocket.on('assistant_response', () => {
        clientSocket.emit('get_session_info');
      });

      clientSocket.on('session_info', (data: { messageCount: number }) => {
        expect(data.messageCount).toBe(2);
        done();
      });

      clientSocket.emit('user_message', { text: 'Test message' });
    });
  });

  describe('session cleanup on disconnection', () => {
    it('should mark session as disconnected when client disconnects', (done) => {
      // Create a new socket specifically for this test to capture the connected event
      const testSocket = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      let sessionId: string;

      testSocket.on('connected', (data: { sessionId: string }) => {
        sessionId = data.sessionId;
        testSocket.disconnect();
      });

      testSocket.on('disconnect', () => {
        setTimeout(() => {
          expect(sessionService.hasSession(sessionId)).toBe(false);
          expect(sessionService.hasDisconnectedSession(sessionId)).toBe(true);
          done();
        }, 100);
      });
    });
  });

  describe('session error handling', () => {
    it('should handle message after session destruction gracefully', (done) => {
      // Create a new socket specifically for this test to capture the connected event
      const testSocket = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      testSocket.on('connected', (data: { sessionId: string }) => {
        sessionService.destroySession(data.sessionId);
        testSocket.emit('user_message', { text: 'Test' });
      });

      testSocket.on('error', (error: { code: string }) => {
        expect(error.code).toBe('SESSION_NOT_FOUND');
        testSocket.disconnect();
        done();
      });
    });
  });

  describe('session isolation', () => {
    it('should isolate sessions between different clients', (done) => {
      const client1Messages: string[] = [];
      const client2Messages: string[] = [];

      const client2 = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      let client1Ready = false;
      let client2Ready = false;

      const checkComplete = () => {
        if (client1Ready && client2Ready) {
          expect(client1Messages).toEqual(['Echo: Hello from client 1']);
          expect(client2Messages).toEqual(['Echo: Hello from client 2']);
          client2.disconnect();
          done();
        }
      };

      clientSocket.on('assistant_response', (data: { text: string }) => {
        client1Messages.push(data.text);
        client1Ready = true;
        checkComplete();
      });

      client2.on('connect', () => {
        client2.on('assistant_response', (data: { text: string }) => {
          client2Messages.push(data.text);
          client2Ready = true;
          checkComplete();
        });

        clientSocket.emit('user_message', { text: 'Hello from client 1' });
        client2.emit('user_message', { text: 'Hello from client 2' });
      });
    });

    it('should maintain separate conversation history per client', (done) => {
      const client2 = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      let client1HistoryReceived = false;
      let client2HistoryReceived = false;
      let client1History: unknown[] = [];
      let client2History: unknown[] = [];

      const checkComplete = () => {
        if (client1HistoryReceived && client2HistoryReceived) {
          expect(client1History.length).toBe(4);
          expect(client2History.length).toBe(2);
          client2.disconnect();
          done();
        }
      };

      client2.on('connect', () => {
        let client1Responses = 0;
        let client2Responses = 0;

        clientSocket.on('assistant_response', () => {
          client1Responses++;
          if (client1Responses === 2) {
            clientSocket.emit('get_history');
          }
        });

        client2.on('assistant_response', () => {
          client2Responses++;
          if (client2Responses === 1) {
            client2.emit('get_history');
          }
        });

        clientSocket.on(
          'conversation_history',
          (data: { messages: unknown[] }) => {
            client1History = data.messages;
            client1HistoryReceived = true;
            checkComplete();
          },
        );

        client2.on(
          'conversation_history',
          (data: { messages: unknown[] }) => {
            client2History = data.messages;
            client2HistoryReceived = true;
            checkComplete();
          },
        );

        clientSocket.emit('user_message', { text: 'Client 1 message 1' });
        clientSocket.emit('user_message', { text: 'Client 1 message 2' });
        client2.emit('user_message', { text: 'Client 2 message 1' });
      });
    });
  });
});
