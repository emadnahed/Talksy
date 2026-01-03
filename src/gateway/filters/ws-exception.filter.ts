import { Catch, ArgumentsHost } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

interface ErrorResponse {
  message: string;
  code: string;
}

interface ValidationException {
  response?: {
    message?: string[];
  };
}

@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();

    const error = this.getErrorMessage(exception);

    client.emit('error', {
      message: error.message,
      code: error.code,
    });
  }

  private getErrorMessage(exception: unknown): ErrorResponse {
    if (exception instanceof WsException) {
      const error = exception.getError();
      if (typeof error === 'string') {
        return { message: error, code: 'WS_ERROR' };
      }
      return error as ErrorResponse;
    }

    if (this.isValidationError(exception)) {
      const validationException = exception as ValidationException;
      const messages = validationException.response?.message || [
        'Validation failed',
      ];
      return {
        message: messages.join(', '),
        code: 'VALIDATION_ERROR',
      };
    }

    if (exception instanceof Error) {
      return { message: exception.message, code: 'INTERNAL_ERROR' };
    }

    return { message: 'An unknown error occurred', code: 'UNKNOWN_ERROR' };
  }

  private isValidationError(exception: unknown): boolean {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      'response' in exception
    );
  }
}
