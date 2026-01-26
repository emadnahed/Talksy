import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, UseGuards, UseInterceptors } from '@nestjs/common';
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
import { AIService } from '../ai/ai.service';
import { ApiKeyGuard } from '../common/guards/api-key.guard';
import { RateLimitGuard } from '../rate-limit/rate-limit.guard';
import { WsLoggingInterceptor } from '../common/interceptors/ws-logging.interceptor';
import {
  WsResponseBuilder,
  ResponseCodes,
} from '../common/dto/api-response.dto';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
@UseGuards(ApiKeyGuard)
@UseInterceptors(WsLoggingInterceptor)
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
    private readonly aiService: AIService,
  ) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);

    // Check if there's a disconnected session for this client
    if (this.sessionService.hasDisconnectedSession(client.id)) {
      const session = this.sessionService.reconnectSession(client.id);
      if (session) {
        this.logger.log(`Session restored for client: ${client.id}`);
        client.emit(
          'connected',
          WsResponseBuilder.success(
            { clientId: client.id, sessionId: session.id },
            ResponseCodes.SESSION_RESTORED,
            'Connection established, session restored',
          ),
        );
        client.emit(
          SESSION_EVENTS.SESSION_RESTORED,
          WsResponseBuilder.success(
            {
              sessionId: session.id,
              expiresAt: session.expiresAt.toISOString(),
              messageCount: session.conversationHistory.length,
            },
            ResponseCodes.SESSION_RESTORED,
            'Previous session restored successfully',
          ),
        );
        return;
      }
    }

    // Create new session
    const session = this.sessionService.createSession(client.id);

    client.emit(
      'connected',
      WsResponseBuilder.success(
        { clientId: client.id, sessionId: session.id },
        ResponseCodes.SESSION_CREATED,
        'Connection established, new session created',
      ),
    );

    client.emit(
      SESSION_EVENTS.SESSION_CREATED,
      WsResponseBuilder.success(
        {
          sessionId: session.id,
          expiresAt: session.expiresAt.toISOString(),
        },
        ResponseCodes.SESSION_CREATED,
        'New session created successfully',
      ),
    );
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Mark session as disconnected (starts grace period)
    const marked = this.sessionService.markDisconnected(client.id);
    if (marked) {
      this.logger.debug(`Session marked as disconnected: ${client.id}`);
    }
  }

  @UseGuards(RateLimitGuard)
  @SubscribeMessage('user_message')
  async handleUserMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: UserMessageDto,
  ): Promise<void> {
    try {
      if (!data || typeof data.text !== 'string' || data.text.trim() === '') {
        client.emit(
          'error',
          WsResponseBuilder.error(
            ResponseCodes.VALIDATION_ERROR,
            'Invalid message format. Expected { text: string }',
          ),
        );
        return;
      }

      // Check if session exists
      if (!this.sessionService.hasSession(client.id)) {
        client.emit(
          'error',
          WsResponseBuilder.error(
            ResponseCodes.SESSION_EXPIRED,
            'Session not found or expired',
          ),
        );
        return;
      }

      // Add user message to history
      this.sessionService.addMessage(client.id, MessageRole.USER, data.text);

      // Get conversation history for AI context
      const history = this.sessionService.getConversationHistory(client.id);

      // Generate AI response
      const result = await this.aiService.generateCompletion(history);

      const response: AssistantResponseDto = {
        text: result.content,
        timestamp: Date.now(),
      };

      // Add assistant response to history
      this.sessionService.addMessage(
        client.id,
        MessageRole.ASSISTANT,
        response.text,
      );

      client.emit(
        'assistant_response',
        WsResponseBuilder.success(
          response,
          ResponseCodes.AI_RESPONSE,
          'AI response generated successfully',
        ),
      );
    } catch (error) {
      this.logger.error('Error handling user message', error);
      client.emit(
        'error',
        WsResponseBuilder.error(
          ResponseCodes.INTERNAL_ERROR,
          'An error occurred while processing your message',
        ),
      );
    }
  }

  @SubscribeMessage('user_message_stream')
  async handleUserMessageStream(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: UserMessageDto,
  ): Promise<void> {
    try {
      if (!data || typeof data.text !== 'string' || data.text.trim() === '') {
        client.emit(
          'error',
          WsResponseBuilder.error(
            ResponseCodes.VALIDATION_ERROR,
            'Invalid message format. Expected { text: string }',
          ),
        );
        return;
      }

      // Check if session exists
      if (!this.sessionService.hasSession(client.id)) {
        client.emit(
          'error',
          WsResponseBuilder.error(
            ResponseCodes.SESSION_EXPIRED,
            'Session not found or expired',
          ),
        );
        return;
      }

      // Add user message to history
      this.sessionService.addMessage(client.id, MessageRole.USER, data.text);

      // Get conversation history for AI context
      const history = this.sessionService.getConversationHistory(client.id);

      // Emit stream start
      client.emit(
        'stream_start',
        WsResponseBuilder.success(
          { timestamp: Date.now() },
          ResponseCodes.AI_STREAM_START,
          'AI response stream started',
        ),
      );

      let fullResponse = '';

      // Generate streaming AI response
      for await (const chunk of this.aiService.generateStream(history)) {
        fullResponse += chunk.content;
        client.emit(
          'stream_chunk',
          WsResponseBuilder.success(
            { content: chunk.content, done: chunk.done },
            ResponseCodes.AI_STREAM_CHUNK,
            'Stream chunk received',
          ),
        );
      }

      // Add complete assistant response to history
      if (fullResponse) {
        this.sessionService.addMessage(
          client.id,
          MessageRole.ASSISTANT,
          fullResponse,
        );
      }

      client.emit(
        'stream_end',
        WsResponseBuilder.success(
          { timestamp: Date.now(), fullResponse },
          ResponseCodes.AI_STREAM_END,
          'AI response stream completed',
        ),
      );
    } catch (error) {
      this.logger.error('Error handling streaming message', error);
      client.emit(
        'error',
        WsResponseBuilder.error(
          ResponseCodes.INTERNAL_ERROR,
          'An error occurred while processing your message',
        ),
      );
    }
  }

  @SubscribeMessage('get_history')
  handleGetHistory(@ConnectedSocket() client: Socket): void {
    const history = this.sessionService.getConversationHistory(client.id);
    client.emit(
      'conversation_history',
      WsResponseBuilder.success(
        { messages: history },
        ResponseCodes.SUCCESS,
        'Conversation history retrieved',
      ),
    );
  }

  @SubscribeMessage('get_session_info')
  handleGetSessionInfo(@ConnectedSocket() client: Socket): void {
    const info = this.sessionService.getSessionInfo(client.id);
    if (info) {
      client.emit(
        'session_info',
        WsResponseBuilder.success(
          info,
          ResponseCodes.SUCCESS,
          'Session info retrieved',
        ),
      );
    } else {
      client.emit(
        'error',
        WsResponseBuilder.error(
          ResponseCodes.SESSION_EXPIRED,
          'Session not found',
        ),
      );
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
          client.emit(
            'error',
            WsResponseBuilder.error(
              ResponseCodes.VALIDATION_ERROR,
              `Invalid category: ${data.category}`,
            ),
          );
          return;
        }
      } else {
        tools = this.toolRegistry.getToolDefinitionDtos(
          data?.includeDeprecated ?? false,
        );
      }

      const response = new ToolListResponseDto(tools);
      client.emit(
        'tools_list',
        WsResponseBuilder.success(
          response,
          ResponseCodes.TOOL_LIST,
          'Tools list retrieved successfully',
        ),
      );
    } catch (error) {
      this.logger.error(`Error listing tools: ${error}`);
      client.emit(
        'error',
        WsResponseBuilder.error(
          ResponseCodes.INTERNAL_ERROR,
          'Failed to list tools',
        ),
      );
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
        client.emit(
          'error',
          WsResponseBuilder.error(
            ResponseCodes.VALIDATION_ERROR,
            'Invalid tool call format. Expected { toolName: string, parameters: object }',
          ),
        );
        return;
      }

      // Check if session exists
      if (!this.sessionService.hasSession(client.id)) {
        client.emit(
          'error',
          WsResponseBuilder.error(
            ResponseCodes.SESSION_EXPIRED,
            'Session not found or expired',
          ),
        );
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

      client.emit(
        'tool_result',
        WsResponseBuilder.success(
          response,
          ResponseCodes.TOOL_EXECUTED,
          'Tool executed successfully',
        ),
      );
    } catch (error) {
      this.logger.error(`Error executing tool: ${error}`);
      client.emit(
        'error',
        WsResponseBuilder.error(
          ResponseCodes.INTERNAL_ERROR,
          'Failed to execute tool',
        ),
      );
    }
  }

  @SubscribeMessage('get_tool_info')
  handleGetToolInfo(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { toolName: string },
  ): void {
    try {
      if (!data?.toolName || typeof data.toolName !== 'string') {
        client.emit(
          'error',
          WsResponseBuilder.error(
            ResponseCodes.VALIDATION_ERROR,
            'Invalid request. Expected { toolName: string }',
          ),
        );
        return;
      }

      const definition = this.toolRegistry.getToolDefinition(data.toolName);

      if (!definition) {
        client.emit(
          'error',
          WsResponseBuilder.error(
            ResponseCodes.TOOL_NOT_FOUND,
            `Tool "${data.toolName}" not found`,
          ),
        );
        return;
      }

      client.emit(
        'tool_info',
        WsResponseBuilder.success(
          definition,
          ResponseCodes.TOOL_INFO,
          'Tool info retrieved successfully',
        ),
      );
    } catch (error) {
      this.logger.error(`Error getting tool info: ${error}`);
      client.emit(
        'error',
        WsResponseBuilder.error(
          ResponseCodes.INTERNAL_ERROR,
          'Failed to get tool info',
        ),
      );
    }
  }
}
