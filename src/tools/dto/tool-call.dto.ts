import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

/**
 * DTO for incoming tool call requests via WebSocket
 */
export class ToolCallRequestDto {
  @IsString()
  @IsNotEmpty()
  toolName!: string;

  @IsObject()
  parameters!: Record<string, unknown>;

  @IsString()
  @IsOptional()
  callId?: string;
}

/**
 * DTO for tool execution result response
 */
export class ToolResultDto {
  readonly success: boolean;
  readonly data?: unknown;
  readonly error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  readonly executionTimeMs: number;

  constructor(
    success: boolean,
    executionTimeMs: number,
    data?: unknown,
    error?: { code: string; message: string; details?: unknown },
  ) {
    this.success = success;
    this.executionTimeMs = executionTimeMs;
    this.data = data;
    this.error = error;
  }
}

/**
 * DTO for tool call response sent to client
 */
export class ToolCallResponseDto {
  readonly callId: string;
  readonly toolName: string;
  readonly result: ToolResultDto;
  readonly timestamp: number;

  constructor(callId: string, toolName: string, result: ToolResultDto) {
    this.callId = callId;
    this.toolName = toolName;
    this.result = result;
    this.timestamp = Date.now();
  }
}

/**
 * DTO for tool definition response
 */
export class ToolDefinitionDto {
  readonly name: string;
  readonly description: string;
  readonly parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  readonly category?: string;
  readonly version?: string;
  readonly deprecated?: boolean;

  constructor(
    name: string,
    description: string,
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    },
    category?: string,
    version?: string,
    deprecated?: boolean,
  ) {
    this.name = name;
    this.description = description;
    this.parameters = parameters;
    this.category = category;
    this.version = version;
    this.deprecated = deprecated;
  }
}

/**
 * DTO for listing available tools response
 */
export class ToolListResponseDto {
  readonly tools: ToolDefinitionDto[];
  readonly count: number;

  constructor(tools: ToolDefinitionDto[]) {
    this.tools = tools;
    this.count = tools.length;
  }
}
