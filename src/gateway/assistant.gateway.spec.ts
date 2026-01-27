import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AssistantGateway } from './assistant.gateway';
import { SessionService } from '../session/session.service';
import { ToolRegistryService } from '../tools/services/tool-registry.service';
import { ToolExecutorService } from '../tools/services/tool-executor.service';
import { AIService } from '../ai/ai.service';
import { Socket } from 'socket.io';
import { MessageRole } from '../session/dto/session-message.dto';
import { SESSION_EVENTS } from '../session/constants/session.constants';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { WsLoggingInterceptor } from '../common/interceptors/ws-logging.interceptor';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { ToolCategory } from '../tools/interfaces/tool.interface';
import { ToolCallRequestDto } from '../tools/dto/tool-call.dto';
import { ResponseCodes } from '../common/dto/api-response.dto';

describe('AssistantGateway', () => {
  let gateway: AssistantGateway;
  let sessionService: jest.Mocked<SessionService>;
  let aiService: jest.Mocked<AIService>;
  let mockSocket: Partial<Socket>;

  const mockSession = {
    id: 'test-socket-id',
    createdAt: new Date(),
    lastActivityAt: new Date(),
    expiresAt: new Date(Date.now() + 900000),
    status: 'active' as const,
    conversationHistory: [],
  };

  const mockSessionInfo = {
    sessionId: 'test-socket-id',
    status: 'active' as const,
    createdAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 900000).toISOString(),
    messageCount: 0,
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: unknown) => {
      const config: Record<string, unknown> = {
        AUTH_ENABLED: false,
        AUTH_BYPASS_IN_DEV: true,
        NODE_ENV: 'development',
        API_KEYS: '',
        RATE_LIMIT_ENABLED: false,
        LOG_WS_EVENTS: false,
      };
      return config[key] ?? defaultValue;
    }),
  };

  const mockRateLimitService = {
    consume: jest.fn().mockReturnValue({ allowed: true, remaining: 9 }),
    reset: jest.fn(),
  };

  beforeEach(async () => {
    const mockSessionService = {
      createSession: jest.fn().mockReturnValue(mockSession),
      getSession: jest.fn().mockReturnValue(mockSession),
      destroySession: jest.fn().mockReturnValue(true),
      markDisconnected: jest.fn().mockReturnValue(true),
      reconnectSession: jest.fn().mockReturnValue(null),
      hasSession: jest.fn().mockReturnValue(true),
      hasDisconnectedSession: jest.fn().mockReturnValue(false),
      addMessage: jest.fn().mockReturnValue({
        role: MessageRole.USER,
        content: 'test',
        timestamp: Date.now(),
      }),
      getConversationHistory: jest.fn().mockReturnValue([]),
      getSessionInfo: jest.fn().mockReturnValue(mockSessionInfo),
      touchSession: jest.fn().mockReturnValue(true),
    };

    const mockToolRegistryService = {
      getToolDefinitionDtos: jest.fn().mockReturnValue([]),
      getToolsByCategory: jest.fn().mockReturnValue([]),
      getToolDefinition: jest.fn().mockReturnValue(null),
      hasTool: jest.fn().mockReturnValue(false),
    };

    const mockToolExecutorService = {
      executeAsDto: jest.fn().mockResolvedValue({
        callId: 'test-call-id',
        toolName: 'test-tool',
        result: { success: true, data: {}, executionTimeMs: 10 },
        timestamp: Date.now(),
      }),
    };

    const mockAIService = {
      generateCompletion: jest.fn().mockResolvedValue({
        content: 'AI Response',
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      }),
      generateStream: jest.fn(),
      currentProvider: 'mock',
      isUsingFallback: false,
      getAvailableProviders: jest.fn().mockReturnValue(['mock']),
      switchProvider: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantGateway,
        { provide: SessionService, useValue: mockSessionService },
        { provide: ToolRegistryService, useValue: mockToolRegistryService },
        { provide: ToolExecutorService, useValue: mockToolExecutorService },
        { provide: AIService, useValue: mockAIService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RateLimitService, useValue: mockRateLimitService },
        ApiKeyGuard,
        RateLimitGuard,
        WsLoggingInterceptor,
      ],
    }).compile();

    gateway = module.get<AssistantGateway>(AssistantGateway);
    sessionService = module.get(SessionService);
    aiService = module.get(AIService);

    mockSocket = {
      id: 'test-socket-id',
      emit: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should create session and emit connected event', () => {
      gateway.handleConnection(mockSocket as Socket);

      expect(sessionService.hasDisconnectedSession).toHaveBeenCalledWith(
        'test-socket-id',
      );
      expect(sessionService.createSession).toHaveBeenCalledWith(
        'test-socket-id',
      );
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'connected',
        expect.objectContaining({
          data: { clientId: 'test-socket-id', sessionId: 'test-socket-id' },
          code: ResponseCodes.SESSION_CREATED,
          status: 'success',
        }),
      );
    });

    it('should emit session_created event with session info', () => {
      gateway.handleConnection(mockSocket as Socket);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        SESSION_EVENTS.SESSION_CREATED,
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: 'test-socket-id',
            expiresAt: expect.any(String),
          }),
          code: ResponseCodes.SESSION_CREATED,
          status: 'success',
        }),
      );
    });

    it('should restore disconnected session if available', () => {
      const restoredSession = {
        ...mockSession,
        conversationHistory: [
          { role: MessageRole.USER, content: 'Hello', timestamp: Date.now() },
        ],
      };
      sessionService.hasDisconnectedSession.mockReturnValue(true);
      sessionService.reconnectSession.mockReturnValue(restoredSession);

      gateway.handleConnection(mockSocket as Socket);

      expect(sessionService.reconnectSession).toHaveBeenCalledWith(
        'test-socket-id',
      );
      expect(sessionService.createSession).not.toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith(
        SESSION_EVENTS.SESSION_RESTORED,
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: 'test-socket-id',
            messageCount: 1,
          }),
          code: ResponseCodes.SESSION_RESTORED,
          status: 'success',
        }),
      );
    });

    it('should create new session if reconnect fails', () => {
      sessionService.hasDisconnectedSession.mockReturnValue(true);
      sessionService.reconnectSession.mockReturnValue(null);

      gateway.handleConnection(mockSocket as Socket);

      expect(sessionService.reconnectSession).toHaveBeenCalledWith(
        'test-socket-id',
      );
      expect(sessionService.createSession).toHaveBeenCalledWith(
        'test-socket-id',
      );
    });
  });

  describe('handleDisconnect', () => {
    it('should mark session as disconnected', () => {
      gateway.handleDisconnect(mockSocket as Socket);

      expect(sessionService.markDisconnected).toHaveBeenCalledWith(
        'test-socket-id',
      );
    });

    it('should handle disconnect when session does not exist', () => {
      sessionService.markDisconnected.mockReturnValue(false);

      expect(() => {
        gateway.handleDisconnect(mockSocket as Socket);
      }).not.toThrow();
    });
  });

  describe('handleUserMessage', () => {
    it('should add messages to session and emit AI response', async () => {
      const messageData = { text: 'Hello, world!' };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(sessionService.hasSession).toHaveBeenCalledWith('test-socket-id');
      expect(sessionService.addMessage).toHaveBeenCalledWith(
        'test-socket-id',
        MessageRole.USER,
        'Hello, world!',
      );
      expect(aiService.generateCompletion).toHaveBeenCalled();
      expect(sessionService.addMessage).toHaveBeenCalledWith(
        'test-socket-id',
        MessageRole.ASSISTANT,
        'AI Response',
      );
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'assistant_response',
        expect.objectContaining({
          data: expect.objectContaining({
            text: 'AI Response',
            timestamp: expect.any(Number),
          }),
          code: ResponseCodes.AI_RESPONSE,
          status: 'success',
        }),
      );
    });

    it('should emit error when session not found', async () => {
      sessionService.hasSession.mockReturnValue(false);
      const messageData = { text: 'Hello' };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

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

    it('should emit error for empty text', async () => {
      const messageData = { text: '' };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

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

    it('should emit error for whitespace-only text', async () => {
      const messageData = { text: '   ' };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

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

    it('should emit error for missing text property', async () => {
      const messageData = {} as { text: string };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

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

    it('should emit error for null data', async () => {
      await gateway.handleUserMessage(
        mockSocket as Socket,
        null as unknown as { text: string },
      );

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

    it('should emit error for non-string text', async () => {
      const messageData = { text: 123 } as unknown as { text: string };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

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

    it('should include timestamp in response', async () => {
      const beforeTime = Date.now();
      const messageData = { text: 'Test message' };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

      const afterTime = Date.now();
      const emitCall = (mockSocket.emit as jest.Mock).mock.calls.find(
        (call) => call[0] === 'assistant_response',
      );

      expect(emitCall).toBeDefined();
      expect(emitCall[1].data.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(emitCall[1].data.timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should emit processing error on exception', async () => {
      sessionService.hasSession.mockImplementation(() => {
        throw new Error('Unexpected error');
      });
      const messageData = { text: 'Test' };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.INTERNAL_ERROR,
          status: 'error',
          description: 'An error occurred while processing your message',
        }),
      );
    });

    it('should emit processing error when AI fails', async () => {
      aiService.generateCompletion.mockRejectedValue(new Error('AI Error'));
      const messageData = { text: 'Hello' };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.INTERNAL_ERROR,
          status: 'error',
          description: 'An error occurred while processing your message',
        }),
      );
    });

    it('should pass conversation history to AI service', async () => {
      const mockHistory = [
        { role: MessageRole.USER, content: 'Previous', timestamp: Date.now() },
      ];
      sessionService.getConversationHistory.mockReturnValue(mockHistory);
      const messageData = { text: 'Hello' };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(aiService.generateCompletion).toHaveBeenCalledWith(mockHistory);
    });
  });

  describe('handleUserMessageStream', () => {
    beforeEach(() => {
      async function* mockStreamGenerator(): AsyncGenerator<{
        content: string;
        done: boolean;
      }> {
        yield { content: 'Hello', done: false };
        yield { content: ' there!', done: false };
        yield { content: '', done: true };
      }
      aiService.generateStream.mockReturnValue(mockStreamGenerator());
    });

    it('should emit stream_start event', async () => {
      const messageData = { text: 'Hello' };

      await gateway.handleUserMessageStream(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'stream_start',
        expect.objectContaining({
          data: expect.objectContaining({ timestamp: expect.any(Number) }),
          code: ResponseCodes.AI_STREAM_START,
          status: 'success',
        }),
      );
    });

    it('should emit batched stream chunks', async () => {
      const messageData = { text: 'Hello' };

      await gateway.handleUserMessageStream(mockSocket as Socket, messageData);

      // With batching enabled, chunks are combined into batches
      // The mock provider yields 3 chunks that get batched together
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'stream_chunk',
        expect.objectContaining({
          data: expect.objectContaining({
            content: expect.any(String), // Combined content
            done: expect.any(Boolean),
            chunkCount: expect.any(Number), // Number of chunks in batch
          }),
          code: ResponseCodes.AI_STREAM_CHUNK,
          status: 'success',
        }),
      );
    });

    it('should emit stream_end with full response', async () => {
      const messageData = { text: 'Hello' };

      await gateway.handleUserMessageStream(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'stream_end',
        expect.objectContaining({
          data: expect.objectContaining({
            timestamp: expect.any(Number),
            fullResponse: 'Hello there!',
          }),
          code: ResponseCodes.AI_STREAM_END,
          status: 'success',
        }),
      );
    });

    it('should add complete response to history', async () => {
      const messageData = { text: 'Hello' };

      await gateway.handleUserMessageStream(mockSocket as Socket, messageData);

      expect(sessionService.addMessage).toHaveBeenCalledWith(
        'test-socket-id',
        MessageRole.ASSISTANT,
        'Hello there!',
      );
    });

    it('should emit error when session not found', async () => {
      sessionService.hasSession.mockReturnValue(false);
      const messageData = { text: 'Hello' };

      await gateway.handleUserMessageStream(mockSocket as Socket, messageData);

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

    it('should emit error for invalid message', async () => {
      const messageData = { text: '' };

      await gateway.handleUserMessageStream(mockSocket as Socket, messageData);

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

    it('should emit processing error on stream failure', async () => {
      async function* errorGenerator(): AsyncGenerator<{
        content: string;
        done: boolean;
      }> {
        throw new Error('Stream failed');
      }
      aiService.generateStream.mockReturnValue(errorGenerator());
      const messageData = { text: 'Hello' };

      await gateway.handleUserMessageStream(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.INTERNAL_ERROR,
          status: 'error',
          description: 'An error occurred while processing your message',
        }),
      );
    });

    it('should not add empty response to history', async () => {
      async function* emptyGenerator(): AsyncGenerator<{
        content: string;
        done: boolean;
      }> {
        yield { content: '', done: true };
      }
      aiService.generateStream.mockReturnValue(emptyGenerator());
      const messageData = { text: 'Hello' };

      await gateway.handleUserMessageStream(mockSocket as Socket, messageData);

      // Should only have one call for the user message, not the assistant response
      const assistantCalls = sessionService.addMessage.mock.calls.filter(
        (call) => call[1] === MessageRole.ASSISTANT,
      );
      expect(assistantCalls).toHaveLength(0);
    });
  });

  describe('handleGetHistory', () => {
    it('should emit conversation history', () => {
      const mockHistory = [
        { role: MessageRole.USER, content: 'Hello', timestamp: Date.now() },
        { role: MessageRole.ASSISTANT, content: 'Hi', timestamp: Date.now() },
      ];
      sessionService.getConversationHistory.mockReturnValue(mockHistory);

      gateway.handleGetHistory(mockSocket as Socket);

      expect(sessionService.getConversationHistory).toHaveBeenCalledWith(
        'test-socket-id',
      );
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'conversation_history',
        expect.objectContaining({
          data: { messages: mockHistory },
          code: ResponseCodes.SUCCESS,
          status: 'success',
        }),
      );
    });

    it('should emit empty array for new session', () => {
      sessionService.getConversationHistory.mockReturnValue([]);

      gateway.handleGetHistory(mockSocket as Socket);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'conversation_history',
        expect.objectContaining({
          data: { messages: [] },
          code: ResponseCodes.SUCCESS,
          status: 'success',
        }),
      );
    });
  });

  describe('handleGetSessionInfo', () => {
    it('should emit session info', () => {
      gateway.handleGetSessionInfo(mockSocket as Socket);

      expect(sessionService.getSessionInfo).toHaveBeenCalledWith(
        'test-socket-id',
      );
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'session_info',
        expect.objectContaining({
          data: mockSessionInfo,
          code: ResponseCodes.SUCCESS,
          status: 'success',
        }),
      );
    });

    it('should emit error when session not found', () => {
      sessionService.getSessionInfo.mockReturnValue(null);

      gateway.handleGetSessionInfo(mockSocket as Socket);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.SESSION_EXPIRED,
          status: 'error',
          description: 'Session not found',
        }),
      );
    });
  });

  describe('handleListTools', () => {
    let toolRegistryService: jest.Mocked<ToolRegistryService>;

    const mockToolDefinitions = [
      {
        name: 'test-tool',
        description: 'A test tool',
        parameters: { type: 'object' as const, properties: {} },
        category: ToolCategory.UTILITY,
      },
      {
        name: 'another-tool',
        description: 'Another test tool',
        parameters: { type: 'object' as const, properties: {} },
        category: ToolCategory.DATA,
      },
    ];

    beforeEach(() => {
      toolRegistryService = gateway['toolRegistry'] as jest.Mocked<ToolRegistryService>;
    });

    it('should emit tools_list with all tools when no category specified', () => {
      toolRegistryService.getToolDefinitionDtos.mockReturnValue(mockToolDefinitions);

      gateway.handleListTools(mockSocket as Socket, {});

      expect(toolRegistryService.getToolDefinitionDtos).toHaveBeenCalledWith(false);
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'tools_list',
        expect.objectContaining({
          data: { tools: mockToolDefinitions, count: 2 },
          code: ResponseCodes.TOOL_LIST,
          status: 'success',
        }),
      );
    });

    it('should emit tools_list with all tools when no data provided', () => {
      toolRegistryService.getToolDefinitionDtos.mockReturnValue(mockToolDefinitions);

      gateway.handleListTools(mockSocket as Socket, undefined);

      expect(toolRegistryService.getToolDefinitionDtos).toHaveBeenCalledWith(false);
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'tools_list',
        expect.objectContaining({
          data: { tools: mockToolDefinitions, count: 2 },
          code: ResponseCodes.TOOL_LIST,
          status: 'success',
        }),
      );
    });

    it('should filter tools by category when specified', () => {
      const utilityTools = [
        {
          definition: mockToolDefinitions[0],
          handler: jest.fn(),
        },
      ];
      toolRegistryService.getToolsByCategory.mockReturnValue(utilityTools);

      gateway.handleListTools(mockSocket as Socket, { category: ToolCategory.UTILITY });

      expect(toolRegistryService.getToolsByCategory).toHaveBeenCalledWith(ToolCategory.UTILITY);
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'tools_list',
        expect.objectContaining({
          data: { tools: [mockToolDefinitions[0]], count: 1 },
          code: ResponseCodes.TOOL_LIST,
          status: 'success',
        }),
      );
    });

    it('should emit error for invalid category', () => {
      gateway.handleListTools(mockSocket as Socket, { category: 'invalid-category' });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.VALIDATION_ERROR,
          status: 'error',
          description: 'Invalid category: invalid-category',
        }),
      );
    });

    it('should include deprecated tools when requested', () => {
      const allTools = [...mockToolDefinitions, { ...mockToolDefinitions[0], deprecated: true }];
      toolRegistryService.getToolDefinitionDtos.mockReturnValue(allTools);

      gateway.handleListTools(mockSocket as Socket, { includeDeprecated: true });

      expect(toolRegistryService.getToolDefinitionDtos).toHaveBeenCalledWith(true);
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'tools_list',
        expect.objectContaining({
          data: { tools: allTools, count: 3 },
          code: ResponseCodes.TOOL_LIST,
          status: 'success',
        }),
      );
    });

    it('should exclude deprecated tools by default', () => {
      toolRegistryService.getToolDefinitionDtos.mockReturnValue(mockToolDefinitions);

      gateway.handleListTools(mockSocket as Socket, {});

      expect(toolRegistryService.getToolDefinitionDtos).toHaveBeenCalledWith(false);
    });

    it('should emit error when registry throws exception', () => {
      toolRegistryService.getToolDefinitionDtos.mockImplementation(() => {
        throw new Error('Registry error');
      });

      gateway.handleListTools(mockSocket as Socket, {});

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.INTERNAL_ERROR,
          status: 'error',
          description: 'Failed to list tools',
        }),
      );
    });
  });

  describe('handleToolCall', () => {
    let toolExecutorService: jest.Mocked<ToolExecutorService>;

    const mockToolResponse = {
      callId: 'test-call-id',
      toolName: 'test-tool',
      result: { success: true, data: { result: 'success' }, executionTimeMs: 10 },
      timestamp: Date.now(),
    };

    beforeEach(() => {
      toolExecutorService = gateway['toolExecutor'] as jest.Mocked<ToolExecutorService>;
      toolExecutorService.executeAsDto.mockResolvedValue(mockToolResponse);
    });

    it('should execute tool and emit tool_result', async () => {
      const callData = {
        toolName: 'test-tool',
        parameters: { key: 'value' },
        callId: 'call-123',
      };

      await gateway.handleToolCall(mockSocket as Socket, callData);

      expect(toolExecutorService.executeAsDto).toHaveBeenCalledWith(
        {
          toolName: 'test-tool',
          parameters: { key: 'value' },
          callId: 'call-123',
        },
        expect.objectContaining({
          sessionId: 'test-socket-id',
          clientId: 'test-socket-id',
          timestamp: expect.any(Number),
        }),
      );
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'tool_result',
        expect.objectContaining({
          data: mockToolResponse,
          code: ResponseCodes.TOOL_EXECUTED,
          status: 'success',
        }),
      );
    });

    it('should emit error for missing toolName', async () => {
      const callData = { parameters: {} } as unknown as ToolCallRequestDto;

      await gateway.handleToolCall(mockSocket as Socket, callData);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.VALIDATION_ERROR,
          status: 'error',
          description: 'Invalid tool call format. Expected { toolName: string, parameters: object }',
        }),
      );
      expect(toolExecutorService.executeAsDto).not.toHaveBeenCalled();
    });

    it('should emit error for non-string toolName', async () => {
      const callData = { toolName: 123, parameters: {} } as unknown as ToolCallRequestDto;

      await gateway.handleToolCall(mockSocket as Socket, callData);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.VALIDATION_ERROR,
          status: 'error',
          description: 'Invalid tool call format. Expected { toolName: string, parameters: object }',
        }),
      );
    });

    it('should emit error for null data', async () => {
      await gateway.handleToolCall(mockSocket as Socket, null as unknown as ToolCallRequestDto);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.VALIDATION_ERROR,
          status: 'error',
          description: 'Invalid tool call format. Expected { toolName: string, parameters: object }',
        }),
      );
    });

    it('should emit error when session not found', async () => {
      sessionService.hasSession.mockReturnValue(false);
      const callData = { toolName: 'test-tool', parameters: {} } as ToolCallRequestDto;

      await gateway.handleToolCall(mockSocket as Socket, callData);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.SESSION_EXPIRED,
          status: 'error',
          description: 'Session not found or expired',
        }),
      );
      expect(toolExecutorService.executeAsDto).not.toHaveBeenCalled();
    });

    it('should use empty object when parameters not provided', async () => {
      const callData = { toolName: 'test-tool' } as unknown as ToolCallRequestDto;

      await gateway.handleToolCall(mockSocket as Socket, callData);

      expect(toolExecutorService.executeAsDto).toHaveBeenCalledWith(
        expect.objectContaining({
          parameters: {},
        }),
        expect.any(Object),
      );
    });

    it('should handle tool execution errors', async () => {
      toolExecutorService.executeAsDto.mockRejectedValue(new Error('Execution failed'));
      const callData = { toolName: 'test-tool', parameters: {} } as ToolCallRequestDto;

      await gateway.handleToolCall(mockSocket as Socket, callData);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.INTERNAL_ERROR,
          status: 'error',
          description: 'Failed to execute tool',
        }),
      );
    });

    it('should generate callId if not provided', async () => {
      const callData = { toolName: 'test-tool', parameters: {} } as ToolCallRequestDto;

      await gateway.handleToolCall(mockSocket as Socket, callData);

      expect(toolExecutorService.executeAsDto).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'test-tool',
          callId: undefined,
        }),
        expect.any(Object),
      );
    });

    it('should include callId in response when provided', async () => {
      const callData = { toolName: 'test-tool', parameters: {}, callId: 'custom-call-id' };

      await gateway.handleToolCall(mockSocket as Socket, callData);

      expect(toolExecutorService.executeAsDto).toHaveBeenCalledWith(
        expect.objectContaining({
          callId: 'custom-call-id',
        }),
        expect.any(Object),
      );
    });
  });

  describe('handleGetToolInfo', () => {
    let toolRegistryService: jest.Mocked<ToolRegistryService>;

    const mockToolDefinition = {
      name: 'test-tool',
      description: 'A test tool for testing',
      parameters: {
        type: 'object' as const,
        properties: {
          input: { type: 'string' as const, description: 'Input value' },
        },
        required: ['input'],
      },
      category: ToolCategory.UTILITY,
      version: '1.0.0',
    };

    beforeEach(() => {
      toolRegistryService = gateway['toolRegistry'] as jest.Mocked<ToolRegistryService>;
    });

    it('should emit tool_info for existing tool', () => {
      toolRegistryService.getToolDefinition.mockReturnValue(mockToolDefinition);

      gateway.handleGetToolInfo(mockSocket as Socket, { toolName: 'test-tool' });

      expect(toolRegistryService.getToolDefinition).toHaveBeenCalledWith('test-tool');
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'tool_info',
        expect.objectContaining({
          data: mockToolDefinition,
          code: ResponseCodes.TOOL_INFO,
          status: 'success',
        }),
      );
    });

    it('should emit error for missing toolName', () => {
      gateway.handleGetToolInfo(mockSocket as Socket, {} as { toolName: string });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.VALIDATION_ERROR,
          status: 'error',
          description: 'Invalid request. Expected { toolName: string }',
        }),
      );
    });

    it('should emit error for non-string toolName', () => {
      gateway.handleGetToolInfo(mockSocket as Socket, { toolName: 123 } as unknown as { toolName: string });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.VALIDATION_ERROR,
          status: 'error',
          description: 'Invalid request. Expected { toolName: string }',
        }),
      );
    });

    it('should emit error for null data', () => {
      gateway.handleGetToolInfo(mockSocket as Socket, null as unknown as { toolName: string });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.VALIDATION_ERROR,
          status: 'error',
          description: 'Invalid request. Expected { toolName: string }',
        }),
      );
    });

    it('should emit error when tool not found', () => {
      toolRegistryService.getToolDefinition.mockReturnValue(null);

      gateway.handleGetToolInfo(mockSocket as Socket, { toolName: 'nonexistent-tool' });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.TOOL_NOT_FOUND,
          status: 'error',
          description: 'Tool "nonexistent-tool" not found',
        }),
      );
    });

    it('should handle registry errors gracefully', () => {
      toolRegistryService.getToolDefinition.mockImplementation(() => {
        throw new Error('Registry error');
      });

      gateway.handleGetToolInfo(mockSocket as Socket, { toolName: 'test-tool' });

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'error',
        expect.objectContaining({
          data: null,
          code: ResponseCodes.INTERNAL_ERROR,
          status: 'error',
          description: 'Failed to get tool info',
        }),
      );
    });
  });
});
