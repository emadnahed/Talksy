import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse, ResponseCodes } from '../dto/api-response.dto';

/**
 * Response Interceptor
 *
 * Wraps all HTTP responses in the standard API response format:
 * {
 *   "data": {...},
 *   "code": "MSG_...",
 *   "httpStatus": 200,
 *   "description": "..."
 * }
 */
@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    return next.handle().pipe(
      map((data) => {
        const statusCode = response.statusCode || HttpStatus.OK;

        // Determine the appropriate code and description
        const { code, description } = this.getResponseMeta(
          request.method,
          request.url,
          statusCode,
          data,
        );

        return {
          data: data ?? null,
          code,
          httpStatus: statusCode,
          description,
        };
      }),
    );
  }

  private getResponseMeta(
    method: string,
    url: string,
    statusCode: number,
    data: T,
  ): { code: string; description: string } {
    // Health endpoints
    if (url.includes('/health')) {
      if (typeof data === 'object' && data !== null && 'status' in data) {
        const status = (data as { status: string }).status;
        if (status === 'ok' || status === 'healthy') {
          return {
            code: ResponseCodes.HEALTH_OK,
            description: 'Service is healthy',
          };
        } else if (status === 'degraded') {
          return {
            code: ResponseCodes.HEALTH_DEGRADED,
            description: 'Service is running with degraded performance',
          };
        } else {
          return {
            code: ResponseCodes.HEALTH_UNHEALTHY,
            description: 'Service is unhealthy',
          };
        }
      }
      return {
        code: ResponseCodes.HEALTH_OK,
        description: 'Health check completed',
      };
    }

    // Root endpoint
    if (url === '/' || url === '') {
      return {
        code: ResponseCodes.SUCCESS,
        description: 'Application info retrieved',
      };
    }

    // Based on HTTP method
    switch (method) {
      case 'POST':
        return {
          code:
            statusCode === HttpStatus.CREATED
              ? ResponseCodes.CREATED
              : ResponseCodes.SUCCESS,
          description:
            statusCode === HttpStatus.CREATED
              ? 'Resource created successfully'
              : 'Request processed successfully',
        };
      case 'PUT':
      case 'PATCH':
        return {
          code: ResponseCodes.UPDATED,
          description: 'Resource updated successfully',
        };
      case 'DELETE':
        return {
          code: ResponseCodes.DELETED,
          description: 'Resource deleted successfully',
        };
      default:
        return {
          code: ResponseCodes.SUCCESS,
          description: 'Request processed successfully',
        };
    }
  }
}
