import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import * as request from 'supertest';
import { AppModule } from '@/app.module';
import { SessionService } from '@/session/session.service';

describe('Production Features (e2e)', () => {
  let app: INestApplication;
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

  describe('Health Check API', () => {
    it('should return simple health status on GET /health', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return detailed health status on GET /health/detailed', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/detailed')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('environment');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('checks');

      // Check memory metrics
      expect(response.body.checks).toHaveProperty('memory');
      expect(response.body.checks.memory).toHaveProperty('status');
      expect(response.body.checks.memory).toHaveProperty('heapUsed');
      expect(response.body.checks.memory).toHaveProperty('heapTotal');

      // Check redis status
      expect(response.body.checks).toHaveProperty('redis');
      expect(response.body.checks.redis).toHaveProperty('status');
      expect(response.body.checks.redis).toHaveProperty('usingFallback');

      // Check sessions metrics
      expect(response.body.checks).toHaveProperty('sessions');
      expect(response.body.checks.sessions).toHaveProperty('active');
      expect(response.body.checks.sessions).toHaveProperty('total');
    });

    it('should return valid health statuses', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/detailed')
        .expect(200);

      const validStatuses = ['healthy', 'degraded', 'unhealthy'];
      expect(validStatuses).toContain(response.body.status);
      expect(validStatuses).toContain(response.body.checks.memory.status);
      expect(validStatuses).toContain(response.body.checks.redis.status);
    });
  });

  describe('WebSocket with Production Guards', () => {
    let clientSocket: Socket;

    afterEach(() => {
      if (clientSocket?.connected) {
        clientSocket.disconnect();
      }
    });

    it('should connect successfully with auth bypass in dev mode', (done) => {
      clientSocket = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        done();
      });

      clientSocket.on('connect_error', (err) => done(err));
    });

    it('should receive session events on connection', (done) => {
      clientSocket = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      clientSocket.on('session_created', (data: { sessionId: string }) => {
        expect(data.sessionId).toBeDefined();
        done();
      });

      clientSocket.on('connect_error', (err) => done(err));
    });

    it('should process messages successfully', (done) => {
      clientSocket = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('user_message', { text: 'Hello' });
      });

      clientSocket.on('assistant_response', (response: { text: string }) => {
        expect(response.text).toBe('Echo: Hello');
        done();
      });

      clientSocket.on('connect_error', (err) => done(err));
      clientSocket.on('error', (err) => done(new Error(JSON.stringify(err))));
    });
  });
});
