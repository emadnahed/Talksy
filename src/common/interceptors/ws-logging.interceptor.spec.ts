import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { WsLoggingInterceptor } from './ws-logging.interceptor';

describe('WsLoggingInterceptor', () => {
  let interceptor: WsLoggingInterceptor;
  let mockConfigService: jest.Mocked<ConfigService>;

  const createMockExecutionContext = (
    clientId = 'test-client',
    pattern = 'test_event',
    data: unknown = { message: 'test' },
  ): ExecutionContext => {
    const mockClient = {
      id: clientId,
    };

    return {
      switchToWs: () => ({
        getClient: () => mockClient,
        getData: () => data,
        getPattern: () => pattern,
      }),
    } as unknown as ExecutionContext;
  };

  const createMockCallHandler = (
    returnValue: unknown = { success: true },
    shouldError = false,
    error?: Error,
  ): CallHandler => {
    return {
      handle: () =>
        shouldError
          ? throwError(() => error || new Error('Test error'))
          : of(returnValue),
    };
  };

  beforeEach(async () => {
    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: unknown) => {
        const config: Record<string, unknown> = {
          LOG_WS_EVENTS: true,
          LOG_FORMAT: 'json',
        };
        return config[key] ?? defaultValue;
      }),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WsLoggingInterceptor,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    interceptor = module.get<WsLoggingInterceptor>(WsLoggingInterceptor);
  });

  describe('when logging is enabled', () => {
    it('should pass through the observable unchanged', (done) => {
      const context = createMockExecutionContext();
      const expectedValue = { result: 'success' };
      const callHandler = createMockCallHandler(expectedValue);

      interceptor.intercept(context, callHandler).subscribe({
        next: (value) => {
          expect(value).toEqual(expectedValue);
          done();
        },
      });
    });

    it('should log successful events', (done) => {
      const logSpy = jest.spyOn(interceptor['logger'], 'log');
      const context = createMockExecutionContext('client-1', 'user_message');
      const callHandler = createMockCallHandler();

      interceptor.intercept(context, callHandler).subscribe({
        next: () => {
          expect(logSpy).toHaveBeenCalled();
          const logCall = logSpy.mock.calls[0][0];
          const parsed = JSON.parse(logCall);

          expect(parsed.clientId).toBe('client-1');
          expect(parsed.event).toBe('user_message');
          expect(parsed.status).toBe('success');
          expect(parsed.duration).toBeDefined();
          expect(parsed.payloadSize).toBeDefined();
          expect(parsed.timestamp).toBeDefined();
          done();
        },
        error: done,
      });
    });

    it('should log error events', (done) => {
      const errorSpy = jest.spyOn(interceptor['logger'], 'log');
      const context = createMockExecutionContext();
      const testError = new Error('Test error message');
      const callHandler = createMockCallHandler(null, true, testError);

      interceptor.intercept(context, callHandler).subscribe({
        error: () => {
          expect(errorSpy).toHaveBeenCalled();
          const logCall = errorSpy.mock.calls[0][0];
          const parsed = JSON.parse(logCall);

          expect(parsed.status).toBe('error');
          expect(parsed.error).toBe('Test error message');
          done();
        },
      });
    });

    it('should calculate payload size correctly', (done) => {
      const logSpy = jest.spyOn(interceptor['logger'], 'log');
      const data = { message: 'hello world' };
      const context = createMockExecutionContext('client-1', 'test', data);
      const callHandler = createMockCallHandler();

      interceptor.intercept(context, callHandler).subscribe({
        next: () => {
          const logCall = logSpy.mock.calls[0][0];
          const parsed = JSON.parse(logCall);

          expect(parsed.payloadSize).toBe(JSON.stringify(data).length);
          done();
        },
        error: done,
      });
    });

    it('should handle null payload', (done) => {
      const logSpy = jest.spyOn(interceptor['logger'], 'log');
      const context = createMockExecutionContext('client-1', 'test', null);
      const callHandler = createMockCallHandler();

      interceptor.intercept(context, callHandler).subscribe({
        next: () => {
          const logCall = logSpy.mock.calls[0][0];
          const parsed = JSON.parse(logCall);

          expect(parsed.payloadSize).toBe(0);
          done();
        },
        error: done,
      });
    });

    it('should handle undefined payload gracefully', async () => {
      const logSpy = jest.spyOn(interceptor['logger'], 'log');
      // Create context with undefined data
      const mockClient = { id: 'client-1' };
      const context = {
        switchToWs: () => ({
          getClient: () => mockClient,
          getData: () => undefined,
          getPattern: () => 'test',
        }),
      } as unknown as ExecutionContext;

      const callHandler = createMockCallHandler({ result: 'ok' });

      const result = await interceptor
        .intercept(context, callHandler)
        .toPromise();

      expect(result).toEqual({ result: 'ok' });
      expect(logSpy).toHaveBeenCalled();
      const logCall = logSpy.mock.calls[0][0];
      const parsed = JSON.parse(logCall);
      expect(parsed.payloadSize).toBe(0);
      expect(parsed.status).toBe('success');
    });
  });

  describe('when logging is disabled', () => {
    beforeEach(async () => {
      const disabledConfigService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          if (key === 'LOG_WS_EVENTS') return false;
          return defaultValue;
        }),
      };

      const module = await Test.createTestingModule({
        providers: [
          WsLoggingInterceptor,
          { provide: ConfigService, useValue: disabledConfigService },
        ],
      }).compile();

      interceptor = module.get<WsLoggingInterceptor>(WsLoggingInterceptor);
    });

    it('should pass through without logging', (done) => {
      const logSpy = jest.spyOn(interceptor['logger'], 'log');
      const context = createMockExecutionContext();
      const callHandler = createMockCallHandler();

      interceptor.intercept(context, callHandler).subscribe({
        next: () => {
          expect(logSpy).not.toHaveBeenCalled();
          done();
        },
        error: done,
      });
    });
  });

  describe('with text format', () => {
    beforeEach(async () => {
      const textFormatConfigService = {
        get: jest.fn((key: string, defaultValue?: unknown) => {
          const config: Record<string, unknown> = {
            LOG_WS_EVENTS: true,
            LOG_FORMAT: 'text',
          };
          return config[key] ?? defaultValue;
        }),
      };

      const module = await Test.createTestingModule({
        providers: [
          WsLoggingInterceptor,
          { provide: ConfigService, useValue: textFormatConfigService },
        ],
      }).compile();

      interceptor = module.get<WsLoggingInterceptor>(WsLoggingInterceptor);
    });

    it('should log in text format for success', (done) => {
      const logSpy = jest.spyOn(interceptor['logger'], 'log');
      const context = createMockExecutionContext('client-1', 'user_message');
      const callHandler = createMockCallHandler();

      interceptor.intercept(context, callHandler).subscribe({
        next: () => {
          expect(logSpy).toHaveBeenCalled();
          const logCall = logSpy.mock.calls[0][0];

          expect(logCall).toContain('✓');
          expect(logCall).toContain('client-1');
          expect(logCall).toContain('user_message');
          expect(logCall).toContain('ms');
          done();
        },
        error: done,
      });
    });

    it('should log in text format for errors', (done) => {
      const errorSpy = jest.spyOn(interceptor['logger'], 'error');
      const context = createMockExecutionContext();
      const callHandler = createMockCallHandler(null, true);

      interceptor.intercept(context, callHandler).subscribe({
        error: () => {
          expect(errorSpy).toHaveBeenCalled();
          const logCall = errorSpy.mock.calls[0][0];

          expect(logCall).toContain('✗');
          expect(logCall).toContain('Test error');
          done();
        },
      });
    });
  });

  describe('duration measurement', () => {
    it('should measure duration accurately', (done) => {
      jest.useFakeTimers();
      const logSpy = jest.spyOn(interceptor['logger'], 'log');
      const context = createMockExecutionContext();

      // Create a delayed call handler
      const callHandler: CallHandler = {
        handle: () => {
          jest.advanceTimersByTime(100);
          return of({ success: true });
        },
      };

      interceptor.intercept(context, callHandler).subscribe({
        next: () => {
          const logCall = logSpy.mock.calls[0][0];
          const parsed = JSON.parse(logCall);

          expect(parsed.duration).toBeGreaterThanOrEqual(100);
          jest.useRealTimers();
          done();
        },
        error: (err) => {
          jest.useRealTimers();
          done(err);
        },
      });
    });
  });
});
