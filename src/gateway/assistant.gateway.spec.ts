import { Test, TestingModule } from '@nestjs/testing';
import { AssistantGateway } from './assistant.gateway';
import { SessionService } from '../session/session.service';
import { ToolRegistryService } from '../tools/services/tool-registry.service';
import { ToolExecutorService } from '../tools/services/tool-executor.service';
import { Socket } from 'socket.io';
import { MessageRole } from '../session/dto/session-message.dto';
import { SESSION_EVENTS } from '../session/constants/session.constants';

describe('AssistantGateway', () => {
  let gateway: AssistantGateway;
  let sessionService: jest.Mocked<SessionService>;
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssistantGateway,
        { provide: SessionService, useValue: mockSessionService },
        { provide: ToolRegistryService, useValue: mockToolRegistryService },
        { provide: ToolExecutorService, useValue: mockToolExecutorService },
      ],
    }).compile();

    gateway = module.get<AssistantGateway>(AssistantGateway);
    sessionService = module.get(SessionService);

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
      expect(mockSocket.emit).toHaveBeenCalledWith('connected', {
        clientId: 'test-socket-id',
        sessionId: 'test-socket-id',
      });
    });

    it('should emit session_created event with session info', () => {
      gateway.handleConnection(mockSocket as Socket);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        SESSION_EVENTS.SESSION_CREATED,
        expect.objectContaining({
          sessionId: 'test-socket-id',
          expiresAt: expect.any(String),
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
          sessionId: 'test-socket-id',
          messageCount: 1,
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
    it('should add messages to session and emit response', () => {
      const messageData = { text: 'Hello, world!' };

      gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(sessionService.hasSession).toHaveBeenCalledWith('test-socket-id');
      expect(sessionService.addMessage).toHaveBeenCalledWith(
        'test-socket-id',
        MessageRole.USER,
        'Hello, world!',
      );
      expect(sessionService.addMessage).toHaveBeenCalledWith(
        'test-socket-id',
        MessageRole.ASSISTANT,
        'Echo: Hello, world!',
      );
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'assistant_response',
        expect.objectContaining({
          text: 'Echo: Hello, world!',
          timestamp: expect.any(Number),
        }),
      );
    });

    it('should emit error when session not found', () => {
      sessionService.hasSession.mockReturnValue(false);
      const messageData = { text: 'Hello' };

      gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Session not found or expired',
        code: 'SESSION_NOT_FOUND',
      });
    });

    it('should emit error for empty text', () => {
      const messageData = { text: '' };

      gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid message format. Expected { text: string }',
        code: 'INVALID_MESSAGE',
      });
    });

    it('should emit error for whitespace-only text', () => {
      const messageData = { text: '   ' };

      gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid message format. Expected { text: string }',
        code: 'INVALID_MESSAGE',
      });
    });

    it('should emit error for missing text property', () => {
      const messageData = {} as { text: string };

      gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid message format. Expected { text: string }',
        code: 'INVALID_MESSAGE',
      });
    });

    it('should emit error for null data', () => {
      gateway.handleUserMessage(
        mockSocket as Socket,
        null as unknown as { text: string },
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid message format. Expected { text: string }',
        code: 'INVALID_MESSAGE',
      });
    });

    it('should emit error for non-string text', () => {
      const messageData = { text: 123 } as unknown as { text: string };

      gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid message format. Expected { text: string }',
        code: 'INVALID_MESSAGE',
      });
    });

    it('should include timestamp in response', () => {
      const beforeTime = Date.now();
      const messageData = { text: 'Test message' };

      gateway.handleUserMessage(mockSocket as Socket, messageData);

      const afterTime = Date.now();
      const emitCall = (mockSocket.emit as jest.Mock).mock.calls.find(
        (call) => call[0] === 'assistant_response',
      );

      expect(emitCall).toBeDefined();
      expect(emitCall[1].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(emitCall[1].timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should emit processing error on exception', () => {
      sessionService.hasSession.mockImplementation(() => {
        throw new Error('Unexpected error');
      });
      const messageData = { text: 'Test' };

      gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'An error occurred while processing your message',
        code: 'PROCESSING_ERROR',
      });
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
      expect(mockSocket.emit).toHaveBeenCalledWith('conversation_history', {
        messages: mockHistory,
      });
    });

    it('should emit empty array for new session', () => {
      sessionService.getConversationHistory.mockReturnValue([]);

      gateway.handleGetHistory(mockSocket as Socket);

      expect(mockSocket.emit).toHaveBeenCalledWith('conversation_history', {
        messages: [],
      });
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
        mockSessionInfo,
      );
    });

    it('should emit error when session not found', () => {
      sessionService.getSessionInfo.mockReturnValue(null);

      gateway.handleGetSessionInfo(mockSocket as Socket);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Session not found',
        code: 'SESSION_NOT_FOUND',
      });
    });
  });
});
