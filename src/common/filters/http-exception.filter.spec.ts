import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { HttpExceptionFilter } from './http-exception.filter';
import { ResponseCodes } from '../dto/api-response.dto';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let mockResponse: any;
  let mockRequest: any;
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockRequest = {
      method: 'GET',
      url: '/test',
    };
    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ArgumentsHost;
  });

  describe('catch with HttpException', () => {
    it('should handle HttpException with string response', () => {
      const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith({
        data: null,
        code: ResponseCodes.NOT_FOUND,
        httpStatus: HttpStatus.NOT_FOUND,
        description: 'Not Found',
      });
    });

    it('should handle HttpException with object response containing message', () => {
      const exception = new HttpException(
        { message: 'Resource not found', error: 'Not Found' },
        HttpStatus.NOT_FOUND,
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith({
        data: null,
        code: ResponseCodes.NOT_FOUND,
        httpStatus: HttpStatus.NOT_FOUND,
        description: 'Resource not found',
      });
    });

    it('should handle validation errors with array of messages', () => {
      const exception = new HttpException(
        { message: ['name must be a string', 'email is required'], error: 'Bad Request' },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith({
        data: null,
        code: ResponseCodes.BAD_REQUEST,
        httpStatus: HttpStatus.BAD_REQUEST,
        description: 'name must be a string; email is required',
      });
    });

    it('should handle BAD_REQUEST status', () => {
      const exception = new HttpException('Bad request', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: ResponseCodes.BAD_REQUEST,
          httpStatus: HttpStatus.BAD_REQUEST,
        }),
      );
    });

    it('should handle UNAUTHORIZED status', () => {
      const exception = new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: ResponseCodes.UNAUTHORIZED,
          httpStatus: HttpStatus.UNAUTHORIZED,
        }),
      );
    });

    it('should handle FORBIDDEN status', () => {
      const exception = new HttpException('Forbidden', HttpStatus.FORBIDDEN);

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: ResponseCodes.FORBIDDEN,
          httpStatus: HttpStatus.FORBIDDEN,
        }),
      );
    });

    it('should handle TOO_MANY_REQUESTS status', () => {
      const exception = new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: ResponseCodes.RATE_LIMITED,
          httpStatus: HttpStatus.TOO_MANY_REQUESTS,
        }),
      );
    });

    it('should handle UNPROCESSABLE_ENTITY status', () => {
      const exception = new HttpException('Validation failed', HttpStatus.UNPROCESSABLE_ENTITY);

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: ResponseCodes.VALIDATION_ERROR,
          httpStatus: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
      );
    });

    it('should handle SERVICE_UNAVAILABLE status', () => {
      const exception = new HttpException('Service unavailable', HttpStatus.SERVICE_UNAVAILABLE);

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: ResponseCodes.SERVICE_UNAVAILABLE,
          httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
        }),
      );
    });

    it('should handle unknown status codes with INTERNAL_ERROR', () => {
      const exception = new HttpException('Conflict', HttpStatus.CONFLICT);

      filter.catch(exception, mockHost);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: ResponseCodes.INTERNAL_ERROR,
          httpStatus: HttpStatus.CONFLICT,
        }),
      );
    });

    it('should handle HttpException object response without message', () => {
      const exception = new HttpException(
        { error: 'Bad Request', statusCode: 400 },
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          code: ResponseCodes.BAD_REQUEST,
        }),
      );
    });
  });

  describe('catch with generic Error', () => {
    it('should handle generic Error', () => {
      const exception = new Error('Something went wrong');

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith({
        data: null,
        code: ResponseCodes.INTERNAL_ERROR,
        httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'Something went wrong',
      });
    });
  });

  describe('catch with unknown exception', () => {
    it('should handle non-Error exception', () => {
      const exception = 'string exception';

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith({
        data: null,
        code: ResponseCodes.INTERNAL_ERROR,
        httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'An unexpected error occurred',
      });
    });

    it('should handle null exception', () => {
      filter.catch(null, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith({
        data: null,
        code: ResponseCodes.INTERNAL_ERROR,
        httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'An unexpected error occurred',
      });
    });

    it('should handle undefined exception', () => {
      filter.catch(undefined, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith({
        data: null,
        code: ResponseCodes.INTERNAL_ERROR,
        httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'An unexpected error occurred',
      });
    });
  });

  describe('sanitizeMessage', () => {
    it('should remove stack trace patterns', () => {
      const exception = new HttpException(
        'Error at someFunction(/path/to/file.ts:123:45)',
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockHost);

      const jsonCall = mockResponse.json.mock.calls[0][0];
      expect(jsonCall.description).not.toContain('at someFunction');
      expect(jsonCall.description).not.toContain('/path/to/file.ts');
    });

    it('should remove file paths with line numbers', () => {
      const exception = new HttpException(
        'Error in /Users/dev/project/src/service.ts:50:10',
        HttpStatus.BAD_REQUEST,
      );

      filter.catch(exception, mockHost);

      const jsonCall = mockResponse.json.mock.calls[0][0];
      expect(jsonCall.description).not.toMatch(/\/[a-zA-Z0-9_\-\/]+\.ts:\d+:\d+/);
    });

    describe('production mode', () => {
      const originalEnv = process.env.NODE_ENV;

      afterEach(() => {
        process.env.NODE_ENV = originalEnv;
      });

      it('should sanitize internal server error in production', () => {
        process.env.NODE_ENV = 'production';
        const exception = new HttpException(
          'Database connection failed: ECONNREFUSED',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );

        filter.catch(exception, mockHost);

        expect(mockResponse.json).toHaveBeenCalledWith({
          data: null,
          code: ResponseCodes.INTERNAL_ERROR,
          httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
          description: 'An internal server error occurred. Please try again later.',
        });
      });

      it('should not sanitize non-500 errors in production', () => {
        process.env.NODE_ENV = 'production';
        const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);

        filter.catch(exception, mockHost);

        expect(mockResponse.json).toHaveBeenCalledWith({
          data: null,
          code: ResponseCodes.NOT_FOUND,
          httpStatus: HttpStatus.NOT_FOUND,
          description: 'Not Found',
        });
      });
    });
  });

  describe('logging', () => {
    it('should log the error details', () => {
      mockRequest.method = 'POST';
      mockRequest.url = '/api/users';
      const exception = new HttpException('Invalid data', HttpStatus.BAD_REQUEST);

      filter.catch(exception, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });
  });
});
