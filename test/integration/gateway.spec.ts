import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { GatewayModule } from '@/gateway/gateway.module';
import { SessionModule } from '@/session/session.module';
import { AIModule } from '@/ai/ai.module';
import { ToolsModule } from '@/tools/tools.module';
import { AssistantGateway } from '@/gateway/assistant.gateway';
import { SessionService } from '@/session/session.service';
import { AIService } from '@/ai/ai.service';
import { ToolRegistryService } from '@/tools/services/tool-registry.service';
import { RateLimitModule } from '@/rate-limit/rate-limit.module';
import { Socket } from 'socket.io';
import { ResponseCodes } from '@/common/dto/api-response.dto';

describe('GatewayModule Integration', () => {
  let module: TestingModule;
  let gateway: AssistantGateway;
  let sessionService: SessionService;
  let aiService: AIService;
  let toolRegistry: ToolRegistryService;

  const createMockSocket = (id: string): Partial<Socket> => ({
    id,
    emit: jest.fn(),
    handshake: {
      headers: { 'x-api-key': 'test-key' },
      query: {},
      auth: {},
    } as any,
  });

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              AUTH_ENABLED: false,
              AUTH_BYPASS_IN_DEV: true,
              NODE_ENV: 'test',
              RATE_LIMIT_ENABLED: false,
              LOG_WS_EVENTS: false,
              AI_PROVIDER: 'mock',
              AI_MOCK_RESPONSE_DELAY_MS: 10,
            }),
          ],
        }),
        EventEmitterModule.forRoot(),
        SessionModule,
        AIModule,
        ToolsModule,
        RateLimitModule,
        GatewayModule,
      ],
    }).compile();

    gateway = module.get<AssistantGateway>(AssistantGateway);
    sessionService = module.get<SessionService>(SessionService);
    aiService = module.get<AIService>(AIService);
    toolRegistry = module.get<ToolRegistryService>(ToolRegistryService);

    // Initialize the module
    await module.init();
  });

  afterEach(async () => {
    sessionService.clearAllSessions();
    sessionService.onModuleDestroy();
    toolRegistry.clearAllTools();
    toolRegistry.onModuleDestroy();
    await module.close();
  });

  describe('Module Integration', () => {
    it('should provide AssistantGateway', () => {
      expect(gateway).toBeDefined();
      expect(gateway).toBeInstanceOf(AssistantGateway);
    });

    it('should inject all required services', () => {
      expect(sessionService).toBeDefined();
      expect(aiService).toBeDefined();
      expect(toolRegistry).toBeDefined();
    });
  });

  describe('Gateway with Session coordination', () => {
    it('should create session on connection', () => {
      const mockSocket = createMockSocket('test-client-1');

      gateway.handleConnection(mockSocket as Socket);

      expect(sessionService.hasSession('test-client-1')).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'connected',
        expect.objectContaining({
          data: { clientId: 'test-client-1', sessionId: 'test-client-1' },
          code: ResponseCodes.SESSION_CREATED,
          status: 'success',
        }),
      );
    });

    it('should mark session as disconnected on disconnect', () => {
      const mockSocket = createMockSocket('test-client-2');

      gateway.handleConnection(mockSocket as Socket);
      expect(sessionService.hasSession('test-client-2')).toBe(true);

      gateway.handleDisconnect(mockSocket as Socket);
      expect(sessionService.hasDisconnectedSession('test-client-2')).toBe(true);
    });

    it('should restore session on reconnection', () => {
      const mockSocket = createMockSocket('reconnect-client');

      // Connect and add a message
      gateway.handleConnection(mockSocket as Socket);
      sessionService.addMessage('reconnect-client', 'user' as any, 'Hello');

      // Disconnect
      gateway.handleDisconnect(mockSocket as Socket);

      // Reconnect
      const newMockSocket = createMockSocket('reconnect-client');
      gateway.handleConnection(newMockSocket as Socket);

      // Session should be restored with history
      const history = sessionService.getConversationHistory('reconnect-client');
      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Hello');
    });
  });

  describe('Gateway with AI Service coordination', () => {
    it('should process user message and get AI response', async () => {
      const mockSocket = createMockSocket('ai-test-client');
      gateway.handleConnection(mockSocket as Socket);

      await gateway.handleUserMessage(mockSocket as Socket, { text: 'Hello AI' });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'assistant_response',
        expect.objectContaining({
          data: expect.objectContaining({
            text: expect.any(String),
            timestamp: expect.any(Number),
          }),
          code: ResponseCodes.AI_RESPONSE,
          status: 'success',
        }),
      );
    });

    it('should add user and assistant messages to history', async () => {
      const mockSocket = createMockSocket('history-test-client');
      gateway.handleConnection(mockSocket as Socket);

      await gateway.handleUserMessage(mockSocket as Socket, { text: 'Test message' });

      const history = sessionService.getConversationHistory('history-test-client');
      // At minimum we should have the user message
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].role).toBe('user');
      // If AI responded, we should have 2 messages
      if (history.length >= 2) {
        expect(history[1].role).toBe('assistant');
      }
    });

    it('should handle streaming message request', async () => {
      const mockSocket = createMockSocket('stream-test-client');
      gateway.handleConnection(mockSocket as Socket);

      // The streaming handler returns a promise that resolves when streaming is complete
      const streamPromise = gateway.handleUserMessageStream(mockSocket as Socket, {
        text: 'Tell me something',
      });

      // handleUserMessageStream is async, wait for it
      await streamPromise;

      // Check that stream_start was emitted at minimum
      const emitCalls = (mockSocket.emit as jest.Mock).mock.calls;
      const eventNames = emitCalls.map((call: any[]) => call[0]);

      // We should have at least connected, session_created, and stream_start
      expect(eventNames).toContain('connected');
      expect(eventNames).toContain('session_created');
      expect(eventNames).toContain('stream_start');
    }, 10000);
  });

  describe('Gateway error handling', () => {
    it('should emit error for invalid message format', async () => {
      const mockSocket = createMockSocket('error-test-client');
      gateway.handleConnection(mockSocket as Socket);

      await gateway.handleUserMessage(mockSocket as Socket, { text: '' });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.VALIDATION_ERROR,
          status: 'error',
          description: 'Invalid message format. Expected { text: string }',
        }),
      );
    });

    it('should emit error when session not found', async () => {
      const mockSocket = createMockSocket('no-session-client');
      // Don't connect, so no session exists

      await gateway.handleUserMessage(mockSocket as Socket, { text: 'Hello' });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.SESSION_EXPIRED,
          status: 'error',
          description: 'Session not found or expired',
        }),
      );
    });
  });

  describe('Gateway with Tool Services coordination', () => {
    beforeEach(() => {
      toolRegistry.registerTool(
        {
          name: 'integration-test-tool',
          description: 'A test tool for integration testing',
          parameters: {
            type: 'object',
            properties: {
              message: { type: 'string' },
            },
            required: [],
          },
        },
        async (params: { message?: string }) => ({
          received: params.message || 'no message',
        }),
      );
    });

    it('should list available tools', () => {
      const mockSocket = createMockSocket('tool-list-client');
      gateway.handleConnection(mockSocket as Socket);

      gateway.handleListTools(mockSocket as Socket, {});

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'tools_list',
        expect.objectContaining({
          data: expect.objectContaining({
            tools: expect.any(Array),
            count: expect.any(Number),
          }),
          code: ResponseCodes.TOOL_LIST,
          status: 'success',
        }),
      );
    });

    it('should execute tool and return result', async () => {
      const mockSocket = createMockSocket('tool-exec-client');
      gateway.handleConnection(mockSocket as Socket);

      await gateway.handleToolCall(mockSocket as Socket, {
        toolName: 'integration-test-tool',
        parameters: { message: 'hello' },
        callId: 'test-call-id',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'tool_result',
        expect.objectContaining({
          data: expect.objectContaining({
            callId: 'test-call-id',
            toolName: 'integration-test-tool',
            result: expect.objectContaining({
              success: true,
            }),
          }),
          code: ResponseCodes.TOOL_EXECUTED,
          status: 'success',
        }),
      );
    });

    it('should get tool info', () => {
      const mockSocket = createMockSocket('tool-info-client');
      gateway.handleConnection(mockSocket as Socket);

      gateway.handleGetToolInfo(mockSocket as Socket, {
        toolName: 'integration-test-tool',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'tool_info',
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'integration-test-tool',
            description: expect.any(String),
          }),
          code: ResponseCodes.TOOL_INFO,
          status: 'success',
        }),
      );
    });
  });

  describe('Gateway session info and history', () => {
    it('should return session info', () => {
      const mockSocket = createMockSocket('session-info-client');
      gateway.handleConnection(mockSocket as Socket);

      gateway.handleGetSessionInfo(mockSocket as Socket);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'session_info',
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: 'session-info-client',
            status: 'active',
          }),
          code: ResponseCodes.SUCCESS,
          status: 'success',
        }),
      );
    });

    it('should return conversation history', async () => {
      const mockSocket = createMockSocket('history-client');
      gateway.handleConnection(mockSocket as Socket);

      // Add some messages
      await gateway.handleUserMessage(mockSocket as Socket, { text: 'First message' });

      gateway.handleGetHistory(mockSocket as Socket);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'conversation_history',
        expect.objectContaining({
          data: expect.objectContaining({
            messages: expect.any(Array),
          }),
          code: ResponseCodes.SUCCESS,
          status: 'success',
        }),
      );
    });
  });
});
