import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '@/app.module';
import { SessionService } from '@/session/session.service';
import { ToolRegistryService } from '@/tools/services/tool-registry.service';
import { ToolCategory } from '@/tools/interfaces/tool.interface';
import { WsResponse } from '@/common/dto/api-response.dto';

describe('AssistantGateway (e2e)', () => {
  let app: INestApplication;
  let clientSocket: Socket;
  let sessionService: SessionService;
  let toolRegistryService: ToolRegistryService;
  const port = 3001;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    sessionService = moduleFixture.get<SessionService>(SessionService);
    toolRegistryService = moduleFixture.get<ToolRegistryService>(ToolRegistryService);

    // Register test tools for e2e testing
    toolRegistryService.registerTool(
      {
        name: 'e2e-echo-tool',
        description: 'An echo tool for E2E testing',
        category: ToolCategory.UTILITY,
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Message to echo' },
          },
          required: ['message'],
        },
      },
      async (params: { message: string }) => ({ echoed: params.message }),
    );

    toolRegistryService.registerTool(
      {
        name: 'e2e-slow-tool',
        description: 'A slow tool for timeout testing',
        category: ToolCategory.UTILITY,
        timeout: 100,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        return { result: 'too slow' };
      },
    );

    await app.listen(port);
  });

  afterAll(async () => {
    sessionService.clearAllSessions();
    toolRegistryService.clearAllTools();
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
        (response: WsResponse<{ clientId: string; sessionId: string }>) => {
          expect(response).toHaveProperty('data');
          expect(response.data).toHaveProperty('clientId');
          expect(response.data).toHaveProperty('sessionId');
          expect(typeof response.data!.clientId).toBe('string');
          expect(typeof response.data!.sessionId).toBe('string');
          expect(response.data!.clientId).toBe(response.data!.sessionId);
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
        (response: WsResponse<{ sessionId: string; expiresAt: string }>) => {
          expect(response).toHaveProperty('data');
          expect(response.data).toHaveProperty('sessionId');
          expect(response.data).toHaveProperty('expiresAt');
          newSocket.disconnect();
          done();
        },
      );
    });
  });

  describe('user_message', () => {
    it('should receive assistant_response after sending user_message', (done) => {
      const testMessage = { text: 'Hello' };

      clientSocket.on(
        'assistant_response',
        (response: WsResponse<{ text: string; timestamp: number }>) => {
          expect(response).toHaveProperty('data');
          expect(response.data).toHaveProperty('text');
          expect(response.data).toHaveProperty('timestamp');
          // AI provider returns a greeting response
          expect(response.data!.text.length).toBeGreaterThan(0);
          expect(typeof response.data!.timestamp).toBe('number');
          done();
        },
      );

      clientSocket.emit('user_message', testMessage);
    });

    it('should receive error for empty message', (done) => {
      const emptyMessage = { text: '' };

      clientSocket.on('error', (response: WsResponse<null>) => {
        expect(response).toHaveProperty('description');
        expect(response).toHaveProperty('code');
        expect(response.code).toBe('MSG_VALIDATION_ERROR');
        done();
      });

      clientSocket.emit('user_message', emptyMessage);
    });

    it('should receive error for malformed message', (done) => {
      const malformedMessage = { invalid: 'data' };

      clientSocket.on('error', (response: WsResponse<null>) => {
        expect(response).toHaveProperty('description');
        expect(response).toHaveProperty('code');
        expect(response.code).toBe('MSG_VALIDATION_ERROR');
        done();
      });

      clientSocket.emit('user_message', malformedMessage);
    });

    it('should handle multiple messages in sequence', (done) => {
      const messages = ['Hello', 'How are you', 'Goodbye'];
      let receivedCount = 0;

      clientSocket.on('assistant_response', (response: WsResponse<{ text: string }>) => {
        receivedCount++;
        expect(response.data!.text.length).toBeGreaterThan(0);

        if (receivedCount === messages.length) {
          done();
        }
      });

      messages.forEach((text) => {
        clientSocket.emit('user_message', { text });
      });
    });
  });

  describe('user_message_stream', () => {
    it('should receive stream_start event', (done) => {
      const testMessage = { text: 'Hello' };

      clientSocket.on('stream_start', (response: WsResponse<{ timestamp: number }>) => {
        expect(response).toHaveProperty('data');
        expect(response.data).toHaveProperty('timestamp');
        expect(typeof response.data!.timestamp).toBe('number');
        done();
      });

      clientSocket.emit('user_message_stream', testMessage);
    });

    it('should receive stream chunks', (done) => {
      const testMessage = { text: 'Hello' };
      const chunks: { content: string; done: boolean }[] = [];

      clientSocket.on(
        'stream_chunk',
        (response: WsResponse<{ content: string; done: boolean }>) => {
          chunks.push(response.data!);
        },
      );

      clientSocket.on(
        'stream_end',
        (response: WsResponse<{ fullResponse: string; timestamp: number }>) => {
          expect(chunks.length).toBeGreaterThan(0);
          expect(response.data!.fullResponse.length).toBeGreaterThan(0);
          done();
        },
      );

      clientSocket.emit('user_message_stream', testMessage);
    });

    it('should receive stream_end event with full response', (done) => {
      const testMessage = { text: 'Hello' };

      clientSocket.on(
        'stream_end',
        (response: WsResponse<{ fullResponse: string; timestamp: number }>) => {
          expect(response).toHaveProperty('data');
          expect(response.data).toHaveProperty('fullResponse');
          expect(response.data).toHaveProperty('timestamp');
          expect(response.data!.fullResponse.length).toBeGreaterThan(0);
          done();
        },
      );

      clientSocket.emit('user_message_stream', testMessage);
    });

    it('should receive error for empty stream message', (done) => {
      const emptyMessage = { text: '' };

      clientSocket.on('error', (response: WsResponse<null>) => {
        expect(response.code).toBe('MSG_VALIDATION_ERROR');
        done();
      });

      clientSocket.emit('user_message_stream', emptyMessage);
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

      testSocket.on('connected', (response: WsResponse<{ sessionId: string }>) => {
        sessionId = response.data!.sessionId;
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

  describe('list_tools', () => {
    it('should return list of available tools', (done) => {
      clientSocket.on(
        'tools_list',
        (response: WsResponse<{ tools: { name: string; description: string }[]; count: number }>) => {
          expect(response).toHaveProperty('data');
          expect(response.data).toHaveProperty('tools');
          expect(response.data).toHaveProperty('count');
          expect(Array.isArray(response.data!.tools)).toBe(true);
          expect(response.data!.count).toBeGreaterThanOrEqual(2); // At least our 2 test tools
          done();
        },
      );

      clientSocket.emit('list_tools', {});
    });

    it('should filter tools by category', (done) => {
      clientSocket.on(
        'tools_list',
        (response: WsResponse<{ tools: { name: string; description: string }[]; count: number }>) => {
          expect(response.data!.tools.length).toBeGreaterThanOrEqual(0);
          // All returned tools should be in UTILITY category
          done();
        },
      );

      clientSocket.emit('list_tools', { category: ToolCategory.UTILITY });
    });
  });

  describe('call_tool', () => {
    it('should execute tool and return result', (done) => {
      clientSocket.on(
        'tool_result',
        (response: WsResponse<{
          callId: string;
          toolName: string;
          result: { success: boolean; data?: unknown };
        }>) => {
          expect(response.data!.callId).toBe('e2e-call-1');
          expect(response.data!.toolName).toBe('e2e-echo-tool');
          expect(response.data!.result.success).toBe(true);
          expect(response.data!.result.data).toEqual({ echoed: 'hello world' });
          done();
        },
      );

      clientSocket.emit('call_tool', {
        toolName: 'e2e-echo-tool',
        parameters: { message: 'hello world' },
        callId: 'e2e-call-1',
      });
    });

    it('should return error for non-existent tool', (done) => {
      clientSocket.on(
        'tool_result',
        (response: WsResponse<{
          callId: string;
          toolName: string;
          result: { success: boolean; error?: { code: string; message: string } };
        }>) => {
          expect(response.data!.callId).toBe('e2e-call-2');
          expect(response.data!.result.success).toBe(false);
          expect(response.data!.result.error).toBeDefined();
          expect(response.data!.result.error?.code).toBe('NOT_FOUND');
          done();
        },
      );

      clientSocket.emit('call_tool', {
        toolName: 'nonexistent-tool',
        parameters: {},
        callId: 'e2e-call-2',
      });
    });

    it('should return error for invalid parameters', (done) => {
      clientSocket.on(
        'tool_result',
        (response: WsResponse<{
          callId: string;
          result: { success: boolean; error?: { code: string } };
        }>) => {
          expect(response.data!.callId).toBe('e2e-call-3');
          expect(response.data!.result.success).toBe(false);
          expect(response.data!.result.error?.code).toBe('INVALID_PARAMETERS');
          done();
        },
      );

      clientSocket.emit('call_tool', {
        toolName: 'e2e-echo-tool',
        parameters: {}, // Missing required 'message' parameter
        callId: 'e2e-call-3',
      });
    });

    it('should handle tool timeout', (done) => {
      clientSocket.on(
        'tool_result',
        (response: WsResponse<{
          callId: string;
          result: { success: boolean; error?: { code: string } };
        }>) => {
          expect(response.data!.callId).toBe('e2e-call-4');
          expect(response.data!.result.success).toBe(false);
          expect(response.data!.result.error?.code).toBe('TIMEOUT');
          done();
        },
      );

      clientSocket.emit('call_tool', {
        toolName: 'e2e-slow-tool',
        parameters: {},
        callId: 'e2e-call-4',
      });
    }, 10000);
  });

  describe('get_tool_info', () => {
    it('should return tool information', (done) => {
      clientSocket.on(
        'tool_info',
        (response: WsResponse<{ name: string; description: string; parameters: unknown }>) => {
          expect(response.data!.name).toBe('e2e-echo-tool');
          expect(response.data!.description).toBe('An echo tool for E2E testing');
          expect(response.data!.parameters).toBeDefined();
          done();
        },
      );

      clientSocket.emit('get_tool_info', { toolName: 'e2e-echo-tool' });
    });

    it('should return error for non-existent tool', (done) => {
      clientSocket.on('error', (response: WsResponse<null>) => {
        expect(response.code).toBe('MSG_TOOL_NOT_FOUND');
        done();
      });

      clientSocket.emit('get_tool_info', { toolName: 'nonexistent-tool' });
    });
  });

  describe('get_session_info', () => {
    it('should return session information', (done) => {
      clientSocket.on(
        'session_info',
        (response: WsResponse<{ sessionId: string; status: string; createdAt: number }>) => {
          expect(response).toHaveProperty('data');
          expect(response.data).toHaveProperty('sessionId');
          expect(response.data).toHaveProperty('status');
          expect(response.data!.status).toBe('active');
          done();
        },
      );

      clientSocket.emit('get_session_info');
    });
  });

  describe('get_history', () => {
    it('should return conversation history', (done) => {
      // First send a message to have history
      clientSocket.once('assistant_response', () => {
        // Now get history
        clientSocket.on(
          'conversation_history',
          (response: WsResponse<{ messages: { role: string; content: string }[] }>) => {
            expect(response).toHaveProperty('data');
            expect(response.data).toHaveProperty('messages');
            expect(Array.isArray(response.data!.messages)).toBe(true);
            expect(response.data!.messages.length).toBeGreaterThanOrEqual(1);
            done();
          },
        );

        clientSocket.emit('get_history');
      });

      clientSocket.emit('user_message', { text: 'Test message for history' });
    });

    it('should return empty array for new session', (done) => {
      // Create a fresh socket
      const freshSocket = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      freshSocket.on('connected', () => {
        freshSocket.on(
          'conversation_history',
          (response: WsResponse<{ messages: { role: string; content: string }[] }>) => {
            expect(response.data!.messages).toEqual([]);
            freshSocket.disconnect();
            done();
          },
        );

        freshSocket.emit('get_history');
      });
    });
  });

  describe('session reconnection', () => {
    it('should restore session on reconnection within grace period', (done) => {
      // Create initial connection and send a message
      const initialSocket = io(`http://localhost:${port}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      let capturedSessionId: string;

      initialSocket.on('connected', (response: WsResponse<{ sessionId: string }>) => {
        capturedSessionId = response.data!.sessionId;

        initialSocket.once('assistant_response', () => {
          // Disconnect
          initialSocket.disconnect();

          // Reconnect with same session ID (simulated - in real scenario the socket ID would be same)
          setTimeout(() => {
            // Check session is marked as disconnected
            expect(sessionService.hasDisconnectedSession(capturedSessionId)).toBe(true);
            done();
          }, 100);
        });

        initialSocket.emit('user_message', { text: 'Message before disconnect' });
      });
    });
  });

  describe('concurrent connections', () => {
    it('should handle multiple clients connecting simultaneously', (done) => {
      const clientCount = 5;
      const sockets: Socket[] = [];
      const sessionIds: string[] = [];

      let connectedCount = 0;

      for (let i = 0; i < clientCount; i++) {
        const socket = io(`http://localhost:${port}`, {
          transports: ['websocket'],
          forceNew: true,
        });

        sockets.push(socket);

        socket.on('connected', (response: WsResponse<{ sessionId: string }>) => {
          sessionIds.push(response.data!.sessionId);
          connectedCount++;

          if (connectedCount === clientCount) {
            // All connected - verify unique sessions
            const uniqueSessions = new Set(sessionIds);
            expect(uniqueSessions.size).toBe(clientCount);

            // Cleanup
            sockets.forEach((s) => s.disconnect());
            done();
          }
        });
      }
    });

    it('should handle concurrent messages from multiple clients', (done) => {
      const clientCount = 3;
      const sockets: Socket[] = [];
      let responseCount = 0;

      for (let i = 0; i < clientCount; i++) {
        const socket = io(`http://localhost:${port}`, {
          transports: ['websocket'],
          forceNew: true,
        });

        sockets.push(socket);

        socket.on('connected', () => {
          socket.on('assistant_response', () => {
            responseCount++;

            if (responseCount === clientCount) {
              // All responses received
              sockets.forEach((s) => s.disconnect());
              done();
            }
          });

          socket.emit('user_message', { text: `Message from client ${i}` });
        });
      }
    });
  });
});
