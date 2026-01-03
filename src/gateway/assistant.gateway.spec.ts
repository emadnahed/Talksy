import { Test, TestingModule } from '@nestjs/testing';
import { AssistantGateway } from './assistant.gateway';
import { SessionService } from '../session/session.service';
import { AIService } from '../ai/ai.service';
import { Socket } from 'socket.io';
import { MessageRole } from '../session/dto/session-message.dto';
import { SESSION_EVENTS } from '../session/constants/session.constants';

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
        { provide: AIService, useValue: mockAIService },
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
          text: 'AI Response',
          timestamp: expect.any(Number),
        }),
      );
    });

    it('should emit error when session not found', async () => {
      sessionService.hasSession.mockReturnValue(false);
      const messageData = { text: 'Hello' };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Session not found or expired',
        code: 'SESSION_NOT_FOUND',
      });
    });

    it('should emit error for empty text', async () => {
      const messageData = { text: '' };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid message format. Expected { text: string }',
        code: 'INVALID_MESSAGE',
      });
    });

    it('should emit error for whitespace-only text', async () => {
      const messageData = { text: '   ' };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid message format. Expected { text: string }',
        code: 'INVALID_MESSAGE',
      });
    });

    it('should emit error for missing text property', async () => {
      const messageData = {} as { text: string };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid message format. Expected { text: string }',
        code: 'INVALID_MESSAGE',
      });
    });

    it('should emit error for null data', async () => {
      await gateway.handleUserMessage(
        mockSocket as Socket,
        null as unknown as { text: string },
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid message format. Expected { text: string }',
        code: 'INVALID_MESSAGE',
      });
    });

    it('should emit error for non-string text', async () => {
      const messageData = { text: 123 } as unknown as { text: string };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid message format. Expected { text: string }',
        code: 'INVALID_MESSAGE',
      });
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
      expect(emitCall[1].timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(emitCall[1].timestamp).toBeLessThanOrEqual(afterTime);
    });

    it('should emit processing error on exception', async () => {
      sessionService.hasSession.mockImplementation(() => {
        throw new Error('Unexpected error');
      });
      const messageData = { text: 'Test' };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'An error occurred while processing your message',
        code: 'PROCESSING_ERROR',
      });
    });

    it('should emit processing error when AI fails', async () => {
      aiService.generateCompletion.mockRejectedValue(new Error('AI Error'));
      const messageData = { text: 'Hello' };

      await gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'An error occurred while processing your message',
        code: 'PROCESSING_ERROR',
      });
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
        expect.objectContaining({ timestamp: expect.any(Number) }),
      );
    });

    it('should emit stream chunks', async () => {
      const messageData = { text: 'Hello' };

      await gateway.handleUserMessageStream(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('stream_chunk', {
        content: 'Hello',
        done: false,
      });
      expect(mockSocket.emit).toHaveBeenCalledWith('stream_chunk', {
        content: ' there!',
        done: false,
      });
    });

    it('should emit stream_end with full response', async () => {
      const messageData = { text: 'Hello' };

      await gateway.handleUserMessageStream(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'stream_end',
        expect.objectContaining({
          timestamp: expect.any(Number),
          fullResponse: 'Hello there!',
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

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Session not found or expired',
        code: 'SESSION_NOT_FOUND',
      });
    });

    it('should emit error for invalid message', async () => {
      const messageData = { text: '' };

      await gateway.handleUserMessageStream(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Invalid message format. Expected { text: string }',
        code: 'INVALID_MESSAGE',
      });
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

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'An error occurred while processing your message',
        code: 'PROCESSING_ERROR',
      });
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
