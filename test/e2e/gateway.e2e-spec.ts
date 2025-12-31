import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '@/app.module';
import { AddressInfo } from 'net';

describe('AssistantGateway (e2e)', () => {
  let app: INestApplication;
  let clientSocket: Socket;
  let port: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0); // Use port 0 to get a random available port
    const address = app.getHttpServer().address() as AddressInfo;
    port = address.port;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    return new Promise<void>((resolve) => {
      clientSocket = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });
      clientSocket.on('connect', () => {
        resolve();
      });
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

    it('should receive connected event with clientId', () => {
      return new Promise<void>((resolve) => {
        const newSocket = io(`http://localhost:${port}`, {
          transports: ['websocket'],
          forceNew: true,
        });

        newSocket.on('connected', (data: { clientId: string }) => {
          expect(data).toHaveProperty('clientId');
          expect(typeof data.clientId).toBe('string');
          newSocket.disconnect();
          resolve();
        });
      });
    });
  });

  describe('user_message', () => {
    it('should receive assistant_response after sending user_message', () => {
      return new Promise<void>((resolve) => {
        const testMessage = { text: 'Hello, AI!' };

        clientSocket.on(
          'assistant_response',
          (response: { text: string; timestamp: number }) => {
            expect(response).toHaveProperty('text');
            expect(response).toHaveProperty('timestamp');
            expect(response.text).toBe('Echo: Hello, AI!');
            expect(typeof response.timestamp).toBe('number');
            resolve();
          },
        );

        clientSocket.emit('user_message', testMessage);
      });
    });

    it('should receive error for invalid message', () => {
      return new Promise<void>((resolve) => {
        const malformedMessage = { invalid: 'data' };

        clientSocket.on('error', (error: { message: string; code: string }) => {
          expect(error).toHaveProperty('message');
          expect(error).toHaveProperty('code');
          resolve();
        });

        clientSocket.emit('user_message', malformedMessage);
      });
    });
  });

  describe('disconnection', () => {
    it('should disconnect gracefully', () => {
      return new Promise<void>((resolve) => {
        clientSocket.on('disconnect', () => {
          expect(clientSocket.connected).toBe(false);
          resolve();
        });

        clientSocket.disconnect();
      });
    });
  });
});
