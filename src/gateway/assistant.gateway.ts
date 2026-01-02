import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { UserMessageDto, AssistantResponseDto } from './dto/message.dto';
import { SessionService } from '../session/session.service';
import { MessageRole } from '../session/dto/session-message.dto';
import { SESSION_EVENTS } from '../session/constants/session.constants';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class AssistantGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(AssistantGateway.name);

  constructor(private readonly sessionService: SessionService) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);

    // Check if there's a disconnected session for this client
    if (this.sessionService.hasDisconnectedSession(client.id)) {
      const session = this.sessionService.reconnectSession(client.id);
      if (session) {
        this.logger.log(`Session restored for client: ${client.id}`);
        client.emit('connected', {
          clientId: client.id,
          sessionId: session.id,
        });
        client.emit(SESSION_EVENTS.SESSION_RESTORED, {
          sessionId: session.id,
          expiresAt: session.expiresAt.toISOString(),
          messageCount: session.conversationHistory.length,
        });
        return;
      }
    }

    // Create new session
    const session = this.sessionService.createSession(client.id);

    client.emit('connected', {
      clientId: client.id,
      sessionId: session.id,
    });

    client.emit(SESSION_EVENTS.SESSION_CREATED, {
      sessionId: session.id,
      expiresAt: session.expiresAt.toISOString(),
    });
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Mark session as disconnected (starts grace period)
    const marked = this.sessionService.markDisconnected(client.id);
    if (marked) {
      this.logger.debug(`Session marked as disconnected: ${client.id}`);
    }
  }

  @SubscribeMessage('user_message')
  handleUserMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: UserMessageDto,
  ): void {
    try {
      if (!data || typeof data.text !== 'string' || data.text.trim() === '') {
        client.emit('error', {
          message: 'Invalid message format. Expected { text: string }',
          code: 'INVALID_MESSAGE',
        });
        return;
      }

      // Check if session exists
      if (!this.sessionService.hasSession(client.id)) {
        client.emit('error', {
          message: 'Session not found or expired',
          code: 'SESSION_NOT_FOUND',
        });
        return;
      }

      // Add user message to history
      this.sessionService.addMessage(client.id, MessageRole.USER, data.text);

      const response: AssistantResponseDto = {
        text: `Echo: ${data.text}`,
        timestamp: Date.now(),
      };

      // Add assistant response to history
      this.sessionService.addMessage(
        client.id,
        MessageRole.ASSISTANT,
        response.text,
      );

      client.emit('assistant_response', response);
    } catch (error) {
      this.logger.error(`Error handling user message: ${error}`);
      client.emit('error', {
        message: 'An error occurred while processing your message',
        code: 'PROCESSING_ERROR',
      });
    }
  }

  @SubscribeMessage('get_history')
  handleGetHistory(@ConnectedSocket() client: Socket): void {
    const history = this.sessionService.getConversationHistory(client.id);
    client.emit('conversation_history', { messages: history });
  }

  @SubscribeMessage('get_session_info')
  handleGetSessionInfo(@ConnectedSocket() client: Socket): void {
    const info = this.sessionService.getSessionInfo(client.id);
    if (info) {
      client.emit('session_info', info);
    } else {
      client.emit('error', {
        message: 'Session not found',
        code: 'SESSION_NOT_FOUND',
      });
    }
  }
}
