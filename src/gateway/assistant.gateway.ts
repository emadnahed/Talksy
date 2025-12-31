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

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
    client.emit('connected', { clientId: client.id });
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
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

      const response: AssistantResponseDto = {
        text: `Echo: ${data.text}`,
        timestamp: Date.now(),
      };

      client.emit('assistant_response', response);
    } catch (error) {
      this.logger.error(`Error handling user message: ${error}`);
      client.emit('error', {
        message: 'An error occurred while processing your message',
        code: 'PROCESSING_ERROR',
      });
    }
  }
}
