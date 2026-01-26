import { ExecutionContext, CallHandler, HttpStatus } from '@nestjs/common';
import { of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';
import { ResponseCodes } from '../dto/api-response.dto';

describe('ResponseInterceptor', () => {
  let interceptor: ResponseInterceptor<any>;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;
  let mockResponse: any;
  let mockRequest: any;

  beforeEach(() => {
    interceptor = new ResponseInterceptor();
    mockResponse = {
      statusCode: HttpStatus.OK,
    };
    mockRequest = {
      method: 'GET',
      url: '/test',
    };
    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
    mockCallHandler = {
      handle: jest.fn().mockReturnValue(of({ result: 'test' })),
    };
  });

  describe('intercept', () => {
    it('should wrap response data in standard format', (done) => {
      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result).toEqual({
          data: { result: 'test' },
          code: ResponseCodes.SUCCESS,
          httpStatus: HttpStatus.OK,
          description: 'Request processed successfully',
        });
        done();
      });
    });

    it('should handle null data', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of(null));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result).toEqual({
          data: null,
          code: ResponseCodes.SUCCESS,
          httpStatus: HttpStatus.OK,
          description: 'Request processed successfully',
        });
        done();
      });
    });

    it('should handle undefined data', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of(undefined));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result).toEqual({
          data: null,
          code: ResponseCodes.SUCCESS,
          httpStatus: HttpStatus.OK,
          description: 'Request processed successfully',
        });
        done();
      });
    });

    it('should use default OK status when statusCode is missing', (done) => {
      mockResponse.statusCode = undefined;

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result.httpStatus).toBe(HttpStatus.OK);
        done();
      });
    });
  });

  describe('getResponseMeta for health endpoints', () => {
    beforeEach(() => {
      mockRequest.url = '/health';
    });

    it('should return HEALTH_OK for status "ok"', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ status: 'ok', uptime: 1000 }));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result.code).toBe(ResponseCodes.HEALTH_OK);
        expect(result.description).toBe('Service is healthy');
        done();
      });
    });

    it('should return HEALTH_OK for status "healthy"', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ status: 'healthy' }));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result.code).toBe(ResponseCodes.HEALTH_OK);
        expect(result.description).toBe('Service is healthy');
        done();
      });
    });

    it('should return HEALTH_DEGRADED for status "degraded"', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ status: 'degraded', redis: 'down' }));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result.code).toBe(ResponseCodes.HEALTH_DEGRADED);
        expect(result.description).toBe('Service is running with degraded performance');
        done();
      });
    });

    it('should return HEALTH_UNHEALTHY for unknown status', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ status: 'critical' }));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result.code).toBe(ResponseCodes.HEALTH_UNHEALTHY);
        expect(result.description).toBe('Service is unhealthy');
        done();
      });
    });

    it('should return HEALTH_OK when data has no status property', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ uptime: 1000 }));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result.code).toBe(ResponseCodes.HEALTH_OK);
        expect(result.description).toBe('Health check completed');
        done();
      });
    });

    it('should return HEALTH_OK when data is null', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of(null));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result.code).toBe(ResponseCodes.HEALTH_OK);
        expect(result.description).toBe('Health check completed');
        done();
      });
    });

    it('should handle /health/detailed endpoint', (done) => {
      mockRequest.url = '/health/detailed';
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ status: 'ok', services: {} }));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result.code).toBe(ResponseCodes.HEALTH_OK);
        done();
      });
    });
  });

  describe('getResponseMeta for root endpoint', () => {
    it('should handle root "/" URL', (done) => {
      mockRequest.url = '/';
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ version: '1.0.0' }));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result.code).toBe(ResponseCodes.SUCCESS);
        expect(result.description).toBe('Application info retrieved');
        done();
      });
    });

    it('should handle empty "" URL', (done) => {
      mockRequest.url = '';
      mockCallHandler.handle = jest.fn().mockReturnValue(of({ version: '1.0.0' }));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result.code).toBe(ResponseCodes.SUCCESS);
        expect(result.description).toBe('Application info retrieved');
        done();
      });
    });
  });

  describe('getResponseMeta for HTTP methods', () => {
    describe('POST method', () => {
      beforeEach(() => {
        mockRequest.method = 'POST';
        mockRequest.url = '/api/users';
      });

      it('should return CREATED for 201 status', (done) => {
        mockResponse.statusCode = HttpStatus.CREATED;
        mockCallHandler.handle = jest.fn().mockReturnValue(of({ id: 1 }));

        interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
          expect(result.code).toBe(ResponseCodes.CREATED);
          expect(result.description).toBe('Resource created successfully');
          expect(result.httpStatus).toBe(HttpStatus.CREATED);
          done();
        });
      });

      it('should return SUCCESS for 200 status', (done) => {
        mockResponse.statusCode = HttpStatus.OK;
        mockCallHandler.handle = jest.fn().mockReturnValue(of({ processed: true }));

        interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
          expect(result.code).toBe(ResponseCodes.SUCCESS);
          expect(result.description).toBe('Request processed successfully');
          expect(result.httpStatus).toBe(HttpStatus.OK);
          done();
        });
      });
    });

    describe('PUT method', () => {
      it('should return UPDATED for PUT requests', (done) => {
        mockRequest.method = 'PUT';
        mockRequest.url = '/api/users/1';
        mockCallHandler.handle = jest.fn().mockReturnValue(of({ id: 1, updated: true }));

        interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
          expect(result.code).toBe(ResponseCodes.UPDATED);
          expect(result.description).toBe('Resource updated successfully');
          done();
        });
      });
    });

    describe('PATCH method', () => {
      it('should return UPDATED for PATCH requests', (done) => {
        mockRequest.method = 'PATCH';
        mockRequest.url = '/api/users/1';
        mockCallHandler.handle = jest.fn().mockReturnValue(of({ id: 1, name: 'Updated' }));

        interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
          expect(result.code).toBe(ResponseCodes.UPDATED);
          expect(result.description).toBe('Resource updated successfully');
          done();
        });
      });
    });

    describe('DELETE method', () => {
      it('should return DELETED for DELETE requests', (done) => {
        mockRequest.method = 'DELETE';
        mockRequest.url = '/api/users/1';
        mockCallHandler.handle = jest.fn().mockReturnValue(of({ deleted: true }));

        interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
          expect(result.code).toBe(ResponseCodes.DELETED);
          expect(result.description).toBe('Resource deleted successfully');
          done();
        });
      });
    });

    describe('GET method', () => {
      it('should return SUCCESS for GET requests', (done) => {
        mockRequest.method = 'GET';
        mockRequest.url = '/api/users';
        mockCallHandler.handle = jest.fn().mockReturnValue(of([{ id: 1 }]));

        interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
          expect(result.code).toBe(ResponseCodes.SUCCESS);
          expect(result.description).toBe('Request processed successfully');
          done();
        });
      });
    });

    describe('HEAD method', () => {
      it('should return SUCCESS for HEAD requests (default case)', (done) => {
        mockRequest.method = 'HEAD';
        mockRequest.url = '/api/users';
        mockCallHandler.handle = jest.fn().mockReturnValue(of(null));

        interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
          expect(result.code).toBe(ResponseCodes.SUCCESS);
          expect(result.description).toBe('Request processed successfully');
          done();
        });
      });
    });

    describe('OPTIONS method', () => {
      it('should return SUCCESS for OPTIONS requests (default case)', (done) => {
        mockRequest.method = 'OPTIONS';
        mockRequest.url = '/api/users';
        mockCallHandler.handle = jest.fn().mockReturnValue(of(null));

        interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
          expect(result.code).toBe(ResponseCodes.SUCCESS);
          expect(result.description).toBe('Request processed successfully');
          done();
        });
      });
    });
  });

  describe('edge cases', () => {
    it('should handle array data', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of([1, 2, 3]));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result.data).toEqual([1, 2, 3]);
        done();
      });
    });

    it('should handle primitive data', (done) => {
      mockCallHandler.handle = jest.fn().mockReturnValue(of('string response'));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result.data).toBe('string response');
        done();
      });
    });

    it('should handle nested objects', (done) => {
      const nestedData = {
        level1: {
          level2: {
            level3: 'deep value',
          },
        },
      };
      mockCallHandler.handle = jest.fn().mockReturnValue(of(nestedData));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe((result) => {
        expect(result.data).toEqual(nestedData);
        done();
      });
    });
  });
});
