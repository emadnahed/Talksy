import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '@/app.module';

describe('AssistantGateway (e2e)', () => {
  let app: INestApplication;
  let clientSocket: Socket;
  const port = 3001;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(port);
  });

  afterAll(async () => {
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

    it('should receive connected event with clientId', (done) => {
      const newSocket = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      newSocket.on('connected', (data: { clientId: string }) => {
        expect(data).toHaveProperty('clientId');
        expect(typeof data.clientId).toBe('string');
        newSocket.disconnect();
        done();
      });
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
  });

  describe('disconnection', () => {
    it('should disconnect gracefully', (done) => {
      clientSocket.on('disconnect', () => {
        expect(clientSocket.connected).toBe(false);
        done();
      });

      clientSocket.disconnect();
    });
  });
});
