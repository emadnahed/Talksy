import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '@/app.module';
import { SessionService } from '@/session/session.service';

describe('AssistantGateway (e2e)', () => {
  let app: INestApplication;
  let clientSocket: Socket;
  let sessionService: SessionService;
  const port = 3001;

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

  describe('connection', () => {
    it('should connect successfully', () => {
      expect(clientSocket.connected).toBe(true);
    });

    it('should receive connected event with clientId and sessionId', (done) => {
      const newSocket = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      newSocket.on(
        'connected',
        (data: { clientId: string; sessionId: string }) => {
          expect(data).toHaveProperty('clientId');
          expect(data).toHaveProperty('sessionId');
          expect(typeof data.clientId).toBe('string');
          expect(typeof data.sessionId).toBe('string');
          expect(data.clientId).toBe(data.sessionId);
          newSocket.disconnect();
          done();
        },
      );
    });

    it('should receive session_created event', (done) => {
      const newSocket = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      newSocket.on(
        'session_created',
        (data: { sessionId: string; expiresAt: string }) => {
          expect(data).toHaveProperty('sessionId');
          expect(data).toHaveProperty('expiresAt');
          newSocket.disconnect();
          done();
        },
      );
    });
  });

  describe('user_message', () => {
    it('should receive assistant_response after sending user_message', (done) => {
      const testMessage = { text: 'Hello, AI!' };

      clientSocket.on(
        'assistant_response',
        (response: { text: string; timestamp: number }) => {
          expect(response).toHaveProperty('text');
          expect(response).toHaveProperty('timestamp');
          expect(response.text).toBe('Echo: Hello, AI!');
          expect(typeof response.timestamp).toBe('number');
          done();
        },
      );

      clientSocket.emit('user_message', testMessage);
    });

    it('should receive error for empty message', (done) => {
      const emptyMessage = { text: '' };

      clientSocket.on('error', (error: { message: string; code: string }) => {
        expect(error).toHaveProperty('message');
        expect(error).toHaveProperty('code');
        expect(error.code).toBe('INVALID_MESSAGE');
        done();
      });

      clientSocket.emit('user_message', emptyMessage);
    });

    it('should receive error for malformed message', (done) => {
      const malformedMessage = { invalid: 'data' };

      clientSocket.on('error', (error: { message: string; code: string }) => {
        expect(error).toHaveProperty('message');
        expect(error).toHaveProperty('code');
        expect(error.code).toBe('INVALID_MESSAGE');
        done();
      });

      clientSocket.emit('user_message', malformedMessage);
    });

    it('should handle multiple messages in sequence', (done) => {
      const messages = ['First', 'Second', 'Third'];
      let receivedCount = 0;

      clientSocket.on('assistant_response', (response: { text: string }) => {
        receivedCount++;
        expect(response.text).toBe(`Echo: ${messages[receivedCount - 1]}`);

        if (receivedCount === messages.length) {
          done();
        }
      });

      messages.forEach((text) => {
        clientSocket.emit('user_message', { text });
      });
    });
  });

  describe('disconnection', () => {
    it('should disconnect gracefully', (done) => {
      clientSocket.on('disconnect', () => {
        expect(clientSocket.connected).toBe(false);
        done();
      });

      clientSocket.disconnect();
    });

    it('should mark session as disconnected on client disconnect', (done) => {
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
          expect(sessionService.hasDisconnectedSession(sessionId)).toBe(true);
          done();
        }, 100);
      });
    });
  });
});
