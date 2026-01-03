/**
 * Tool parameter schema definition following JSON Schema format
 */
export interface ToolParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  enum?: (string | number | boolean)[];
  items?: ToolParameterSchema;
  properties?: Record<string, ToolParameterSchema>;
  required?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

/**
 * Tool definition interface
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterSchema>;
    required?: string[];
  };
  category?: ToolCategory;
  version?: string;
  deprecated?: boolean;
  timeout?: number; // Execution timeout in ms
}

/**
 * Tool categories for organization
 */
export enum ToolCategory {
  UTILITY = 'utility',
  DATA = 'data',
  COMMUNICATION = 'communication',
  SYSTEM = 'system',
  CUSTOM = 'custom',
}

/**
 * Tool execution context
 */
export interface ToolExecutionContext {
  sessionId: string;
  clientId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/**
 * Tool execution result
 */
export interface ToolExecutionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: ToolErrorCode;
    message: string;
    details?: unknown;
  };
  executionTimeMs: number;
}

/**
 * Tool error codes
 */
export enum ToolErrorCode {
  INVALID_PARAMETERS = 'INVALID_PARAMETERS',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  TIMEOUT = 'TIMEOUT',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED',
  RATE_LIMITED = 'RATE_LIMITED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Tool call request
 */
export interface ToolCallRequest {
  toolName: string;
  parameters: Record<string, unknown>;
  callId?: string;
}

/**
 * Tool call response
 */
export interface ToolCallResponse {
  callId: string;
  toolName: string;
  result: ToolExecutionResult;
  timestamp: number;
}

/**
 * Tool handler function type
 */
export type ToolHandler<
  TParams = Record<string, unknown>,
  TResult = unknown,
> = (
  params: TParams,
  context: ToolExecutionContext,
) => Promise<TResult> | TResult;

/**
 * Complete tool registration interface
 */
export interface Tool<TParams = Record<string, unknown>, TResult = unknown> {
  definition: ToolDefinition;
  handler: ToolHandler<TParams, TResult>;
}
