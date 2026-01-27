import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiResponse, ResponseCodes, ResponseCode } from '../dto/api-response.dto';

/**
 * HTTP Exception Filter
 *
 * Catches all HTTP exceptions and formats them in the standard response format:
 * {
 *   "data": null,
 *   "code": "MSG_...",
 *   "httpStatus": 400,
 *   "description": "..."
 * }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'An unexpected error occurred';
    let code: ResponseCode = ResponseCodes.INTERNAL_ERROR;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const responseObj = exceptionResponse as Record<string, unknown>;
        message = (responseObj.message as string) || exception.message;

        // Handle validation errors (array of messages)
        if (Array.isArray(responseObj.message)) {
          message = responseObj.message.join('; ');
          code = ResponseCodes.VALIDATION_ERROR;
        }
      }

      code = this.getErrorCode(status);
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled error: ${message}`, exception.stack);
    }

    // Sanitize error message for security (don't expose internal details)
    const sanitizedMessage = this.sanitizeMessage(message, status);

    const errorResponse: ApiResponse<null> = {
      data: null,
      code,
      httpStatus: status,
      description: sanitizedMessage,
    };

    this.logger.warn(
      `HTTP ${status} ${request.method} ${request.url} - ${code}: ${sanitizedMessage}`,
    );

    response.status(status).json(errorResponse);
  }

  private getErrorCode(status: number): ResponseCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ResponseCodes.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ResponseCodes.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ResponseCodes.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ResponseCodes.NOT_FOUND;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ResponseCodes.RATE_LIMITED;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ResponseCodes.VALIDATION_ERROR;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ResponseCodes.SERVICE_UNAVAILABLE;
      default:
        return ResponseCodes.INTERNAL_ERROR;
    }
  }

  private sanitizeMessage(message: string, status: number): string {
    // In production, don't expose internal error details
    if (
      process.env.NODE_ENV === 'production' &&
      status === HttpStatus.INTERNAL_SERVER_ERROR
    ) {
      return 'An internal server error occurred. Please try again later.';
    }

    // Remove stack traces and sensitive paths
    return message
      .replace(/at .+\(.+\)/g, '')
      .replace(/\/[a-zA-Z0-9_\-\/]+\.ts:\d+:\d+/g, '')
      .trim();
  }
}
