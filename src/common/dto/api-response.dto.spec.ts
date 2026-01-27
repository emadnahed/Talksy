import { HttpStatus } from '@nestjs/common';
import {
  ApiResponseBuilder,
  WsResponseBuilder,
  ResponseCodes,
} from './api-response.dto';

describe('ApiResponseBuilder', () => {
  describe('success', () => {
    it('should create a success response with data and default description', () => {
      const data = { id: 1, name: 'Test' };
      const response = ApiResponseBuilder.success(data);

      expect(response).toEqual({
        data: { id: 1, name: 'Test' },
        code: ResponseCodes.SUCCESS,
        httpStatus: HttpStatus.OK,
        description: 'Request processed successfully',
      });
    });

    it('should create a success response with custom description', () => {
      const data = { result: 'ok' };
      const response = ApiResponseBuilder.success(data, 'Custom success message');

      expect(response).toEqual({
        data: { result: 'ok' },
        code: ResponseCodes.SUCCESS,
        httpStatus: HttpStatus.OK,
        description: 'Custom success message',
      });
    });

    it('should handle null data', () => {
      const response = ApiResponseBuilder.success(null);

      expect(response.data).toBeNull();
      expect(response.code).toBe(ResponseCodes.SUCCESS);
    });
  });

  describe('created', () => {
    it('should create a created response with data and default description', () => {
      const data = { id: 123, createdAt: '2024-01-01' };
      const response = ApiResponseBuilder.created(data);

      expect(response).toEqual({
        data: { id: 123, createdAt: '2024-01-01' },
        code: ResponseCodes.CREATED,
        httpStatus: HttpStatus.CREATED,
        description: 'Resource created successfully',
      });
    });

    it('should create a created response with custom description', () => {
      const data = { userId: 'abc' };
      const response = ApiResponseBuilder.created(data, 'User account created');

      expect(response).toEqual({
        data: { userId: 'abc' },
        code: ResponseCodes.CREATED,
        httpStatus: HttpStatus.CREATED,
        description: 'User account created',
      });
    });
  });

  describe('error', () => {
    it('should create an error response with BAD_REQUEST', () => {
      const response = ApiResponseBuilder.error(
        ResponseCodes.BAD_REQUEST,
        HttpStatus.BAD_REQUEST,
        'Invalid input provided',
      );

      expect(response).toEqual({
        data: null,
        code: ResponseCodes.BAD_REQUEST,
        httpStatus: HttpStatus.BAD_REQUEST,
        description: 'Invalid input provided',
      });
    });

    it('should create an error response with NOT_FOUND', () => {
      const response = ApiResponseBuilder.error(
        ResponseCodes.NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Resource not found',
      );

      expect(response).toEqual({
        data: null,
        code: ResponseCodes.NOT_FOUND,
        httpStatus: HttpStatus.NOT_FOUND,
        description: 'Resource not found',
      });
    });

    it('should create an error response with INTERNAL_ERROR', () => {
      const response = ApiResponseBuilder.error(
        ResponseCodes.INTERNAL_ERROR,
        HttpStatus.INTERNAL_SERVER_ERROR,
        'An unexpected error occurred',
      );

      expect(response).toEqual({
        data: null,
        code: ResponseCodes.INTERNAL_ERROR,
        httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
        description: 'An unexpected error occurred',
      });
    });

    it('should create an error response with RATE_LIMITED', () => {
      const response = ApiResponseBuilder.error(
        ResponseCodes.RATE_LIMITED,
        HttpStatus.TOO_MANY_REQUESTS,
        'Too many requests',
      );

      expect(response).toEqual({
        data: null,
        code: ResponseCodes.RATE_LIMITED,
        httpStatus: HttpStatus.TOO_MANY_REQUESTS,
        description: 'Too many requests',
      });
    });
  });

  describe('custom', () => {
    it('should create a custom response with all parameters', () => {
      const data = { items: [1, 2, 3], total: 3 };
      const response = ApiResponseBuilder.custom(
        data,
        ResponseCodes.SUCCESS,
        HttpStatus.OK,
        'Items retrieved successfully',
      );

      expect(response).toEqual({
        data: { items: [1, 2, 3], total: 3 },
        code: ResponseCodes.SUCCESS,
        httpStatus: HttpStatus.OK,
        description: 'Items retrieved successfully',
      });
    });

    it('should create a custom response with HEALTH_DEGRADED', () => {
      const data = { status: 'degraded', services: { redis: 'down' } };
      const response = ApiResponseBuilder.custom(
        data,
        ResponseCodes.HEALTH_DEGRADED,
        HttpStatus.OK,
        'Service is running with degraded performance',
      );

      expect(response).toEqual({
        data: { status: 'degraded', services: { redis: 'down' } },
        code: ResponseCodes.HEALTH_DEGRADED,
        httpStatus: HttpStatus.OK,
        description: 'Service is running with degraded performance',
      });
    });

    it('should create a custom response with null data', () => {
      const response = ApiResponseBuilder.custom(
        null,
        ResponseCodes.DELETED,
        HttpStatus.OK,
        'Resource deleted',
      );

      expect(response).toEqual({
        data: null,
        code: ResponseCodes.DELETED,
        httpStatus: HttpStatus.OK,
        description: 'Resource deleted',
      });
    });
  });
});

describe('WsResponseBuilder', () => {
  describe('success', () => {
    it('should create a WebSocket success response', () => {
      const beforeTimestamp = Date.now();
      const data = { message: 'Hello', sender: 'user' };
      const response = WsResponseBuilder.success(
        data,
        ResponseCodes.AI_RESPONSE,
        'AI response received',
      );
      const afterTimestamp = Date.now();

      expect(response.data).toEqual({ message: 'Hello', sender: 'user' });
      expect(response.code).toBe(ResponseCodes.AI_RESPONSE);
      expect(response.status).toBe('success');
      expect(response.description).toBe('AI response received');
      expect(response.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(response.timestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should create a session created response', () => {
      const data = { sessionId: 'sess-123', clientId: 'client-456' };
      const response = WsResponseBuilder.success(
        data,
        ResponseCodes.SESSION_CREATED,
        'Session created',
      );

      expect(response.data).toEqual({ sessionId: 'sess-123', clientId: 'client-456' });
      expect(response.code).toBe(ResponseCodes.SESSION_CREATED);
      expect(response.status).toBe('success');
    });
  });

  describe('error', () => {
    it('should create a WebSocket error response', () => {
      const beforeTimestamp = Date.now();
      const response = WsResponseBuilder.error(
        ResponseCodes.SESSION_EXPIRED,
        'Session has expired',
      );
      const afterTimestamp = Date.now();

      expect(response.data).toBeNull();
      expect(response.code).toBe(ResponseCodes.SESSION_EXPIRED);
      expect(response.status).toBe('error');
      expect(response.description).toBe('Session has expired');
      expect(response.timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(response.timestamp).toBeLessThanOrEqual(afterTimestamp);
    });

    it('should create a validation error response', () => {
      const response = WsResponseBuilder.error(
        ResponseCodes.VALIDATION_ERROR,
        'Invalid message format',
      );

      expect(response.data).toBeNull();
      expect(response.code).toBe(ResponseCodes.VALIDATION_ERROR);
      expect(response.status).toBe('error');
      expect(response.description).toBe('Invalid message format');
    });

    it('should create a rate limited error response', () => {
      const response = WsResponseBuilder.error(
        ResponseCodes.RATE_LIMITED,
        'Too many requests. Please slow down.',
      );

      expect(response.data).toBeNull();
      expect(response.code).toBe(ResponseCodes.RATE_LIMITED);
      expect(response.status).toBe('error');
    });
  });
});

describe('ResponseCodes', () => {
  it('should have all expected success codes', () => {
    expect(ResponseCodes.SUCCESS).toBe('MSG_SUCCESS');
    expect(ResponseCodes.CREATED).toBe('MSG_CREATED');
    expect(ResponseCodes.UPDATED).toBe('MSG_UPDATED');
    expect(ResponseCodes.DELETED).toBe('MSG_DELETED');
  });

  it('should have all expected health codes', () => {
    expect(ResponseCodes.HEALTH_OK).toBe('MSG_HEALTH_OK');
    expect(ResponseCodes.HEALTH_DEGRADED).toBe('MSG_HEALTH_DEGRADED');
    expect(ResponseCodes.HEALTH_UNHEALTHY).toBe('MSG_HEALTH_UNHEALTHY');
  });

  it('should have all expected AI codes', () => {
    expect(ResponseCodes.AI_RESPONSE).toBe('MSG_AI_RESPONSE');
    expect(ResponseCodes.AI_STREAM_START).toBe('MSG_AI_STREAM_START');
    expect(ResponseCodes.AI_STREAM_CHUNK).toBe('MSG_AI_STREAM_CHUNK');
    expect(ResponseCodes.AI_STREAM_END).toBe('MSG_AI_STREAM_END');
    expect(ResponseCodes.AI_PROVIDER_UNAVAILABLE).toBe('MSG_AI_PROVIDER_UNAVAILABLE');
  });

  it('should have all expected session codes', () => {
    expect(ResponseCodes.SESSION_CREATED).toBe('MSG_SESSION_CREATED');
    expect(ResponseCodes.SESSION_RESTORED).toBe('MSG_SESSION_RESTORED');
    expect(ResponseCodes.SESSION_EXPIRED).toBe('MSG_SESSION_EXPIRED');
  });

  it('should have all expected tool codes', () => {
    expect(ResponseCodes.TOOL_EXECUTED).toBe('MSG_TOOL_EXECUTED');
    expect(ResponseCodes.TOOL_LIST).toBe('MSG_TOOL_LIST');
    expect(ResponseCodes.TOOL_INFO).toBe('MSG_TOOL_INFO');
    expect(ResponseCodes.TOOL_NOT_FOUND).toBe('MSG_TOOL_NOT_FOUND');
  });

  it('should have all expected error codes', () => {
    expect(ResponseCodes.BAD_REQUEST).toBe('MSG_BAD_REQUEST');
    expect(ResponseCodes.UNAUTHORIZED).toBe('MSG_UNAUTHORIZED');
    expect(ResponseCodes.FORBIDDEN).toBe('MSG_FORBIDDEN');
    expect(ResponseCodes.NOT_FOUND).toBe('MSG_NOT_FOUND');
    expect(ResponseCodes.RATE_LIMITED).toBe('MSG_RATE_LIMITED');
    expect(ResponseCodes.VALIDATION_ERROR).toBe('MSG_VALIDATION_ERROR');
    expect(ResponseCodes.INTERNAL_ERROR).toBe('MSG_INTERNAL_ERROR');
    expect(ResponseCodes.SERVICE_UNAVAILABLE).toBe('MSG_SERVICE_UNAVAILABLE');
  });
});
