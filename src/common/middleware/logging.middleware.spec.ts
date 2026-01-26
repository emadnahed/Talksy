import { LoggingMiddleware, LogEntry } from './logging.middleware';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';

describe('LoggingMiddleware', () => {
  let middleware: LoggingMiddleware;
  let mockConfigService: Partial<ConfigService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigService = {
      get: jest.fn(),
    };
    mockRequest = {
      method: 'GET',
      url: '/api/test',
      get: jest.fn().mockReturnValue('Mozilla/5.0'),
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' } as any,
    };
    mockResponse = {
      statusCode: 200,
      send: jest.fn().mockImplementation(function (this: any, body: any) {
        return this;
      }),
    };
    mockNext = jest.fn();
  });

  describe('instantiation', () => {
    it('should be defined with ConfigService', () => {
      middleware = new LoggingMiddleware(mockConfigService as ConfigService);
      expect(middleware).toBeDefined();
    });

    it('should be defined without ConfigService', () => {
      middleware = new LoggingMiddleware();
      expect(middleware).toBeDefined();
    });

    it('should default to enabled when config not available', () => {
      middleware = new LoggingMiddleware();
      const nextFn = jest.fn();
      middleware.use(mockRequest as Request, mockResponse as Response, nextFn);
      expect(nextFn).toHaveBeenCalled();
    });

    it('should respect LOG_HTTP_REQUESTS config', () => {
      (mockConfigService.get as jest.Mock).mockImplementation(
        (key: string, defaultValue: any) => {
          if (key === 'LOG_HTTP_REQUESTS') return false;
          return defaultValue;
        },
      );
      middleware = new LoggingMiddleware(mockConfigService as ConfigService);
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should respect LOG_FORMAT config for json', () => {
      (mockConfigService.get as jest.Mock).mockImplementation(
        (key: string, defaultValue: any) => {
          if (key === 'LOG_FORMAT') return 'json';
          if (key === 'LOG_HTTP_REQUESTS') return true;
          return defaultValue;
        },
      );
      middleware = new LoggingMiddleware(mockConfigService as ConfigService);
      expect(middleware).toBeDefined();
    });

    it('should respect LOG_FORMAT config for text', () => {
      (mockConfigService.get as jest.Mock).mockImplementation(
        (key: string, defaultValue: any) => {
          if (key === 'LOG_FORMAT') return 'text';
          if (key === 'LOG_HTTP_REQUESTS') return true;
          return defaultValue;
        },
      );
      middleware = new LoggingMiddleware(mockConfigService as ConfigService);
      expect(middleware).toBeDefined();
    });
  });

  describe('use', () => {
    beforeEach(() => {
      (mockConfigService.get as jest.Mock).mockImplementation(
        (key: string, defaultValue: any) => {
          if (key === 'LOG_HTTP_REQUESTS') return true;
          if (key === 'LOG_FORMAT') return 'json';
          return defaultValue;
        },
      );
      middleware = new LoggingMiddleware(mockConfigService as ConfigService);
    });

    it('should call next function', () => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should override response send method', () => {
      const originalSend = mockResponse.send;
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);
      expect(mockResponse.send).not.toBe(originalSend);
    });

    it('should log request when response is sent', (done) => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Call the overridden send method
      (mockResponse.send as jest.Mock).call(mockResponse, '{"data":"test"}');

      // Use setImmediate to wait for the logging
      setImmediate(() => {
        done();
      });
    });

    it('should skip logging when disabled', () => {
      (mockConfigService.get as jest.Mock).mockImplementation(
        (key: string, defaultValue: any) => {
          if (key === 'LOG_HTTP_REQUESTS') return false;
          return defaultValue;
        },
      );
      middleware = new LoggingMiddleware(mockConfigService as ConfigService);

      const originalSend = mockResponse.send;
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.send).toBe(originalSend);
    });

    it('should handle empty body', (done) => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      // Call send with empty body
      (mockResponse.send as jest.Mock).call(mockResponse, '');

      setImmediate(() => {
        done();
      });
    });

    it('should handle null body', (done) => {
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      (mockResponse.send as jest.Mock).call(mockResponse, null);

      setImmediate(() => {
        done();
      });
    });

    it('should capture IP from connection when req.ip is undefined', (done) => {
      const requestWithoutIp = {
        ...mockRequest,
        ip: undefined,
      } as unknown as Request;
      middleware.use(requestWithoutIp, mockResponse as Response, mockNext);

      (mockResponse.send as jest.Mock).call(mockResponse, 'test');

      setImmediate(() => {
        done();
      });
    });
  });

  describe('logRequest with text format', () => {
    beforeEach(() => {
      (mockConfigService.get as jest.Mock).mockImplementation(
        (key: string, defaultValue: any) => {
          if (key === 'LOG_HTTP_REQUESTS') return true;
          if (key === 'LOG_FORMAT') return 'text';
          return defaultValue;
        },
      );
      middleware = new LoggingMiddleware(mockConfigService as ConfigService);
    });

    it('should log success requests in green', (done) => {
      mockResponse.statusCode = 200;
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      (mockResponse.send as jest.Mock).call(mockResponse, 'success');

      setImmediate(() => {
        done();
      });
    });

    it('should log redirect requests in yellow', (done) => {
      mockResponse.statusCode = 301;
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      (mockResponse.send as jest.Mock).call(mockResponse, 'redirect');

      setImmediate(() => {
        done();
      });
    });

    it('should log error requests in red', (done) => {
      mockResponse.statusCode = 500;
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      (mockResponse.send as jest.Mock).call(mockResponse, 'error');

      setImmediate(() => {
        done();
      });
    });

    it('should log 400 errors as error status', (done) => {
      mockResponse.statusCode = 400;
      middleware.use(mockRequest as Request, mockResponse as Response, mockNext);

      (mockResponse.send as jest.Mock).call(mockResponse, 'bad request');

      setImmediate(() => {
        done();
      });
    });
  });
});
