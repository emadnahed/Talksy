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
import { ToolRegistryService } from '../tools/services/tool-registry.service';
import { ToolExecutorService } from '../tools/services/tool-executor.service';
import {
  ToolCallRequestDto,
  ToolListResponseDto,
} from '../tools/dto/tool-call.dto';
import { ToolCategory } from '../tools/interfaces/tool.interface';

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

  constructor(
    private readonly sessionService: SessionService,
    private readonly toolRegistry: ToolRegistryService,
    private readonly toolExecutor: ToolExecutorService,
  ) {}

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

  @SubscribeMessage('list_tools')
  handleListTools(
    @ConnectedSocket() client: Socket,
    @MessageBody() data?: { category?: string; includeDeprecated?: boolean },
  ): void {
    try {
      let tools;

      if (data?.category) {
        const category = data.category as ToolCategory;
        if (Object.values(ToolCategory).includes(category)) {
          tools = this.toolRegistry
            .getToolsByCategory(category)
            .map((t) => t.definition);
        } else {
          client.emit('error', {
            message: `Invalid category: ${data.category}`,
            code: 'INVALID_CATEGORY',
          });
          return;
        }
      } else {
        tools = this.toolRegistry.getToolDefinitionDtos(
          data?.includeDeprecated ?? false,
        );
      }

      const response = new ToolListResponseDto(tools);
      client.emit('tools_list', response);
    } catch (error) {
      this.logger.error(`Error listing tools: ${error}`);
      client.emit('error', {
        message: 'Failed to list tools',
        code: 'TOOL_LIST_ERROR',
      });
    }
  }

  @SubscribeMessage('call_tool')
  async handleToolCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ToolCallRequestDto,
  ): Promise<void> {
    try {
      // Validate request
      if (!data?.toolName || typeof data.toolName !== 'string') {
        client.emit('error', {
          message:
            'Invalid tool call format. Expected { toolName: string, parameters: object }',
          code: 'INVALID_TOOL_CALL',
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

      // Create execution context
      const context = {
        sessionId: client.id,
        clientId: client.id,
        timestamp: Date.now(),
      };

      // Execute the tool
      const response = await this.toolExecutor.executeAsDto(
        {
          toolName: data.toolName,
          parameters: data.parameters ?? {},
          callId: data.callId,
        },
        context,
      );

      client.emit('tool_result', response);
    } catch (error) {
      this.logger.error(`Error executing tool: ${error}`);
      client.emit('error', {
        message: 'Failed to execute tool',
        code: 'TOOL_EXECUTION_ERROR',
      });
    }
  }

  @SubscribeMessage('get_tool_info')
  handleGetToolInfo(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { toolName: string },
  ): void {
    try {
      if (!data?.toolName || typeof data.toolName !== 'string') {
        client.emit('error', {
          message: 'Invalid request. Expected { toolName: string }',
          code: 'INVALID_REQUEST',
        });
        return;
      }

      const definition = this.toolRegistry.getToolDefinition(data.toolName);

      if (!definition) {
        client.emit('error', {
          message: `Tool "${data.toolName}" not found`,
          code: 'TOOL_NOT_FOUND',
        });
        return;
      }

      client.emit('tool_info', definition);
    } catch (error) {
      this.logger.error(`Error getting tool info: ${error}`);
      client.emit('error', {
        message: 'Failed to get tool info',
        code: 'TOOL_INFO_ERROR',
      });
    }
  }
}
