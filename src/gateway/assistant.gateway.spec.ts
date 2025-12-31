import { Test, TestingModule } from '@nestjs/testing';
import { AssistantGateway } from './assistant.gateway';
import { Socket } from 'socket.io';

describe('AssistantGateway', () => {
  let gateway: AssistantGateway;
  let mockSocket: Partial<Socket>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AssistantGateway],
    }).compile();

    gateway = module.get<AssistantGateway>(AssistantGateway);

    mockSocket = {
      id: 'test-socket-id',
      emit: jest.fn(),
    };
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should emit connected event with client id', () => {
      gateway.handleConnection(mockSocket as Socket);

      expect(mockSocket.emit).toHaveBeenCalledWith('connected', {
        clientId: 'test-socket-id',
      });
    });
  });

  describe('handleDisconnect', () => {
    it('should handle disconnection without errors', () => {
      expect(() => {
        gateway.handleDisconnect(mockSocket as Socket);
      }).not.toThrow();
    });
  });

  describe('handleUserMessage', () => {
    it('should emit assistant_response with echo message', () => {
      const messageData = { text: 'Hello, world!' };

      gateway.handleUserMessage(mockSocket as Socket, messageData);

      expect(mockSocket.emit).toHaveBeenCalledWith(
        'assistant_response',
        expect.objectContaining({
          text: 'Echo: Hello, world!',
          timestamp: expect.any(Number),
        }),
      );
    });

    it('should emit error for empty text', () => {
      const messageData = { text: '' };

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
  });
});
