import { HttpStatus } from '@nestjs/common';

/**
 * Standard API Response Format
 *
 * All API responses follow this structure:
 * {
 *   "data": {...},
 *   "code": "MSG_...",
 *   "httpStatus": 200,
 *   "description": "..."
 * }
 */
export interface ApiResponse<T = unknown> {
  data: T | null;
  code: string;
  httpStatus: HttpStatus;
  description: string;
}

/**
 * Response codes for different scenarios
 */
export const ResponseCodes = {
  // Success codes
  SUCCESS: 'MSG_SUCCESS',
  CREATED: 'MSG_CREATED',
  UPDATED: 'MSG_UPDATED',
  DELETED: 'MSG_DELETED',

  // Health & Status
  HEALTH_OK: 'MSG_HEALTH_OK',
  HEALTH_DEGRADED: 'MSG_HEALTH_DEGRADED',
  HEALTH_UNHEALTHY: 'MSG_HEALTH_UNHEALTHY',

  // AI related
  AI_RESPONSE: 'MSG_AI_RESPONSE',
  AI_STREAM_START: 'MSG_AI_STREAM_START',
  AI_STREAM_CHUNK: 'MSG_AI_STREAM_CHUNK',
  AI_STREAM_END: 'MSG_AI_STREAM_END',
  AI_PROVIDER_UNAVAILABLE: 'MSG_AI_PROVIDER_UNAVAILABLE',

  // Session related
  SESSION_CREATED: 'MSG_SESSION_CREATED',
  SESSION_RESTORED: 'MSG_SESSION_RESTORED',
  SESSION_EXPIRED: 'MSG_SESSION_EXPIRED',

  // Tool related
  TOOL_EXECUTED: 'MSG_TOOL_EXECUTED',
  TOOL_LIST: 'MSG_TOOL_LIST',
  TOOL_INFO: 'MSG_TOOL_INFO',
  TOOL_NOT_FOUND: 'MSG_TOOL_NOT_FOUND',

  // Error codes
  BAD_REQUEST: 'MSG_BAD_REQUEST',
  UNAUTHORIZED: 'MSG_UNAUTHORIZED',
  FORBIDDEN: 'MSG_FORBIDDEN',
  NOT_FOUND: 'MSG_NOT_FOUND',
  RATE_LIMITED: 'MSG_RATE_LIMITED',
  VALIDATION_ERROR: 'MSG_VALIDATION_ERROR',
  INTERNAL_ERROR: 'MSG_INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'MSG_SERVICE_UNAVAILABLE',
} as const;

export type ResponseCode = (typeof ResponseCodes)[keyof typeof ResponseCodes];

/**
 * Helper class to build standard responses
 */
export class ApiResponseBuilder {
  static success<T>(
    data: T,
    description = 'Request processed successfully',
  ): ApiResponse<T> {
    return {
      data,
      code: ResponseCodes.SUCCESS,
      httpStatus: HttpStatus.OK,
      description,
    };
  }

  static created<T>(
    data: T,
    description = 'Resource created successfully',
  ): ApiResponse<T> {
    return {
      data,
      code: ResponseCodes.CREATED,
      httpStatus: HttpStatus.CREATED,
      description,
    };
  }

  static error(
    code: ResponseCode,
    httpStatus: HttpStatus,
    description: string,
  ): ApiResponse<null> {
    return {
      data: null,
      code,
      httpStatus,
      description,
    };
  }

  static custom<T>(
    data: T,
    code: ResponseCode,
    httpStatus: HttpStatus,
    description: string,
  ): ApiResponse<T> {
    return {
      data,
      code,
      httpStatus,
      description,
    };
  }
}

/**
 * WebSocket response format (similar structure)
 */
export interface WsResponse<T = unknown> {
  data: T | null;
  code: string;
  status: 'success' | 'error';
  description: string;
  timestamp: number;
}

export class WsResponseBuilder {
  static success<T>(
    data: T,
    code: ResponseCode,
    description: string,
  ): WsResponse<T> {
    return {
      data,
      code,
      status: 'success',
      description,
      timestamp: Date.now(),
    };
  }

  static error(code: ResponseCode, description: string): WsResponse<null> {
    return {
      data: null,
      code,
      status: 'error',
      description,
      timestamp: Date.now(),
    };
  }
}
