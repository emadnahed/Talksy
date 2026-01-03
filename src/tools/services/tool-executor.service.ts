import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { v4 as uuidv4 } from 'uuid';
import {
  ToolExecutionContext,
  ToolErrorCode,
  ToolCallRequest,
  ToolCallResponse,
} from '../interfaces/tool.interface';
import { ToolRegistryService } from './tool-registry.service';
import { ToolCallResponseDto, ToolResultDto } from '../dto/tool-call.dto';
import { TOOL_DEFAULTS, TOOL_EVENTS } from '../constants/tool.constants';

/**
 * Tool executor configuration
 */
interface ToolExecutorConfig {
  defaultTimeoutMs: number;
  maxConcurrentExecutions: number;
  maxParameterSize: number;
}

/**
 * Execution tracking for concurrency control
 */
interface ExecutionTracker {
  activeExecutions: Map<string, Set<string>>; // sessionId -> Set of callIds
}

/**
 * Service responsible for executing tools with sandboxing and safety controls
 */
@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name);
  private readonly config: ToolExecutorConfig;
  private readonly tracker: ExecutionTracker = {
    activeExecutions: new Map(),
  };

  constructor(
    private readonly registryService: ToolRegistryService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {
    this.config = this.loadConfig();
  }

  private loadConfig(): ToolExecutorConfig {
    return {
      defaultTimeoutMs:
        this.configService?.get<number>('TOOL_EXECUTION_TIMEOUT_MS') ??
        TOOL_DEFAULTS.EXECUTION_TIMEOUT_MS,
      maxConcurrentExecutions:
        this.configService?.get<number>('TOOL_MAX_CONCURRENT_EXECUTIONS') ??
        TOOL_DEFAULTS.MAX_CONCURRENT_EXECUTIONS,
      maxParameterSize:
        this.configService?.get<number>('TOOL_MAX_PARAMETER_SIZE') ??
        TOOL_DEFAULTS.MAX_PARAMETER_SIZE,
    };
  }

  /**
   * Execute a tool call with full sandboxing and error handling
   * @param request - Tool call request
   * @param context - Execution context
   * @returns Tool call response
   */
  async execute(
    request: ToolCallRequest,
    context: ToolExecutionContext,
  ): Promise<ToolCallResponse> {
    const callId = request.callId ?? uuidv4();
    const startTime = Date.now();

    this.logger.debug(
      `Executing tool: ${request.toolName} (callId: ${callId})`,
    );

    // Emit execution started event
    this.eventEmitter?.emit(TOOL_EVENTS.TOOL_EXECUTION_STARTED, {
      callId,
      toolName: request.toolName,
      sessionId: context.sessionId,
    });

    try {
      // Validate concurrency limits
      const concurrencyResult = this.checkConcurrencyLimit(context.sessionId);
      if (!concurrencyResult.allowed) {
        return this.createErrorResponse(
          callId,
          request.toolName,
          startTime,
          ToolErrorCode.RATE_LIMITED,
          concurrencyResult.message,
        );
      }

      // Track this execution
      this.trackExecution(context.sessionId, callId);

      // Validate parameter size
      const sizeResult = this.validateParameterSize(request.parameters);
      if (!sizeResult.valid) {
        this.untrackExecution(context.sessionId, callId);
        return this.createErrorResponse(
          callId,
          request.toolName,
          startTime,
          ToolErrorCode.INVALID_PARAMETERS,
          sizeResult.message,
        );
      }

      // Get the tool
      const tool = this.registryService.getTool(request.toolName);
      if (!tool) {
        this.untrackExecution(context.sessionId, callId);
        return this.createErrorResponse(
          callId,
          request.toolName,
          startTime,
          ToolErrorCode.NOT_FOUND,
          `Tool "${request.toolName}" not found`,
        );
      }

      // Validate parameters against schema
      const validationResult = this.validateParameters(
        request.parameters,
        tool.definition.parameters,
      );
      if (!validationResult.valid) {
        this.untrackExecution(context.sessionId, callId);
        return this.createErrorResponse(
          callId,
          request.toolName,
          startTime,
          ToolErrorCode.INVALID_PARAMETERS,
          validationResult.message,
          validationResult.details,
        );
      }

      // Execute with timeout
      const timeout = tool.definition.timeout ?? this.config.defaultTimeoutMs;
      const result = await this.executeWithTimeout(
        () => tool.handler(request.parameters, context),
        timeout,
      );

      this.untrackExecution(context.sessionId, callId);

      const executionTimeMs = Date.now() - startTime;

      const response: ToolCallResponse = {
        callId,
        toolName: request.toolName,
        result: {
          success: true,
          data: result,
          executionTimeMs,
        },
        timestamp: Date.now(),
      };

      this.logger.debug(
        `Tool execution completed: ${request.toolName} in ${executionTimeMs}ms`,
      );

      this.eventEmitter?.emit(TOOL_EVENTS.TOOL_EXECUTION_COMPLETED, {
        callId,
        toolName: request.toolName,
        sessionId: context.sessionId,
        executionTimeMs,
      });

      return response;
    } catch (error) {
      this.untrackExecution(context.sessionId, callId);

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      const isTimeout =
        error instanceof Error && error.message === 'Execution timeout';

      this.logger.error(
        `Tool execution failed: ${request.toolName} - ${errorMessage}`,
      );

      this.eventEmitter?.emit(TOOL_EVENTS.TOOL_EXECUTION_FAILED, {
        callId,
        toolName: request.toolName,
        sessionId: context.sessionId,
        error: errorMessage,
      });

      return this.createErrorResponse(
        callId,
        request.toolName,
        startTime,
        isTimeout ? ToolErrorCode.TIMEOUT : ToolErrorCode.EXECUTION_FAILED,
        errorMessage,
      );
    }
  }

  /**
   * Execute a tool call and return as DTO
   */
  async executeAsDto(
    request: ToolCallRequest,
    context: ToolExecutionContext,
  ): Promise<ToolCallResponseDto> {
    const response = await this.execute(request, context);

    const resultDto = new ToolResultDto(
      response.result.success,
      response.result.executionTimeMs,
      response.result.data,
      response.result.error,
    );

    return new ToolCallResponseDto(
      response.callId,
      response.toolName,
      resultDto,
    );
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async executeMany(
    requests: ToolCallRequest[],
    context: ToolExecutionContext,
  ): Promise<ToolCallResponse[]> {
    return Promise.all(requests.map((req) => this.execute(req, context)));
  }

  /**
   * Get current active execution count for a session
   */
  getActiveExecutionCount(sessionId: string): number {
    return this.tracker.activeExecutions.get(sessionId)?.size ?? 0;
  }

  /**
   * Execute a function with a timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T> | T,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Execution timeout'));
      }, timeoutMs);

      Promise.resolve(fn())
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Check concurrency limit for session
   */
  private checkConcurrencyLimit(sessionId: string): {
    allowed: boolean;
    message: string;
  } {
    const activeCount = this.getActiveExecutionCount(sessionId);
    if (activeCount >= this.config.maxConcurrentExecutions) {
      return {
        allowed: false,
        message: `Maximum concurrent executions (${this.config.maxConcurrentExecutions}) reached for session`,
      };
    }
    return { allowed: true, message: '' };
  }

  /**
   * Track an execution for concurrency control
   */
  private trackExecution(sessionId: string, callId: string): void {
    let sessionExecutions = this.tracker.activeExecutions.get(sessionId);
    if (!sessionExecutions) {
      sessionExecutions = new Set();
      this.tracker.activeExecutions.set(sessionId, sessionExecutions);
    }
    sessionExecutions.add(callId);
  }

  /**
   * Untrack an execution
   */
  private untrackExecution(sessionId: string, callId: string): void {
    const sessionExecutions = this.tracker.activeExecutions.get(sessionId);
    if (sessionExecutions) {
      sessionExecutions.delete(callId);
      if (sessionExecutions.size === 0) {
        this.tracker.activeExecutions.delete(sessionId);
      }
    }
  }

  /**
   * Validate parameter size
   */
  private validateParameterSize(parameters: Record<string, unknown>): {
    valid: boolean;
    message: string;
  } {
    try {
      const size = JSON.stringify(parameters).length;
      if (size > this.config.maxParameterSize) {
        return {
          valid: false,
          message: `Parameter size (${size} bytes) exceeds maximum allowed (${this.config.maxParameterSize} bytes)`,
        };
      }
      return { valid: true, message: '' };
    } catch {
      return {
        valid: false,
        message: 'Parameters cannot be serialized to JSON',
      };
    }
  }

  /**
   * Validate parameters against tool schema
   */
  private validateParameters(
    parameters: Record<string, unknown>,
    schema: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    },
  ): { valid: boolean; message: string; details?: unknown } {
    // Check required parameters
    if (schema.required) {
      for (const requiredParam of schema.required) {
        if (!(requiredParam in parameters)) {
          return {
            valid: false,
            message: `Missing required parameter: ${requiredParam}`,
            details: { missingParameter: requiredParam },
          };
        }
      }
    }

    // Check for unknown parameters
    const knownParams = new Set(Object.keys(schema.properties));
    for (const param of Object.keys(parameters)) {
      if (!knownParams.has(param)) {
        return {
          valid: false,
          message: `Unknown parameter: ${param}`,
          details: { unknownParameter: param },
        };
      }
    }

    // Basic type validation
    for (const [paramName, paramValue] of Object.entries(parameters)) {
      const paramSchema = schema.properties[paramName] as {
        type?: string;
        enum?: unknown[];
      };
      if (paramSchema) {
        const typeValid = this.validateType(paramValue, paramSchema);
        if (!typeValid.valid) {
          return {
            valid: false,
            message: `Invalid type for parameter "${paramName}": ${typeValid.message}`,
            details: { parameter: paramName, ...(typeValid.details as object) },
          };
        }
      }
    }

    return { valid: true, message: '' };
  }

  /**
   * Validate a value against a type schema
   */
  private validateType(
    value: unknown,
    schema: { type?: string; enum?: unknown[] },
  ): { valid: boolean; message: string; details?: unknown } {
    // Check enum values
    if (schema.enum && !schema.enum.includes(value)) {
      return {
        valid: false,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        details: { allowedValues: schema.enum, actualValue: value },
      };
    }

    // Check type
    if (schema.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;

      if (schema.type === 'array' && !Array.isArray(value)) {
        return {
          valid: false,
          message: `Expected array, got ${actualType}`,
          details: { expectedType: 'array', actualType },
        };
      }

      if (
        schema.type !== 'array' &&
        actualType !== schema.type &&
        !(schema.type === 'number' && actualType === 'number')
      ) {
        // Allow null for any type (optional parameters might be null)
        if (value !== null) {
          return {
            valid: false,
            message: `Expected ${schema.type}, got ${actualType}`,
            details: { expectedType: schema.type, actualType },
          };
        }
      }
    }

    return { valid: true, message: '' };
  }

  /**
   * Create an error response
   */
  private createErrorResponse(
    callId: string,
    toolName: string,
    startTime: number,
    errorCode: ToolErrorCode,
    message: string,
    details?: unknown,
  ): ToolCallResponse {
    const executionTimeMs = Date.now() - startTime;

    return {
      callId,
      toolName,
      result: {
        success: false,
        error: {
          code: errorCode,
          message,
          details,
        },
        executionTimeMs,
      },
      timestamp: Date.now(),
    };
  }
}
