import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { UserMessageDto, AssistantResponseDto } from './dto/message.dto';
import { WsExceptionFilter } from './filters/ws-exception.filter';

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
})
@UseFilters(new WsExceptionFilter())
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

  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  @SubscribeMessage('user_message')
  handleUserMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: UserMessageDto,
  ): void {
    try {
      const response: AssistantResponseDto = {
        text: `Echo: ${data.text}`,
        timestamp: Date.now(),
      };

      client.emit('assistant_response', response);
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Error handling user message: ${err.message}`,
        err.stack,
      );
      client.emit('error', {
        message: 'An error occurred while processing your message',
        code: 'PROCESSING_ERROR',
      });
    }
  }
}
