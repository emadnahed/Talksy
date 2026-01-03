import { WsExceptionFilter } from './ws-exception.filter';
import { ArgumentsHost } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

describe('WsExceptionFilter', () => {
  let filter: WsExceptionFilter;
  let mockSocket: Partial<Socket>;
  let mockArgumentsHost: ArgumentsHost;

  beforeEach(() => {
    filter = new WsExceptionFilter();

    mockSocket = {
      emit: jest.fn(),
    };

    mockArgumentsHost = {
      switchToWs: () => ({
        getClient: <T>() => mockSocket as unknown as T,
        getData: <T>() => ({}) as T,
        getPattern: () => 'test',
      }),
      switchToHttp: () => ({}) as ReturnType<ArgumentsHost['switchToHttp']>,
      switchToRpc: () => ({}) as ReturnType<ArgumentsHost['switchToRpc']>,
      getArgs: <T extends unknown[]>() => [] as unknown as T,
      getArgByIndex: <T>() => null as unknown as T,
      getType: <TContext extends string>() => 'ws' as TContext,
    };
  });

  it('should be defined', () => {
    expect(filter).toBeDefined();
  });

  describe('catch', () => {
    it('should emit error for WsException with string message', () => {
      const exception = new WsException('Test error message');

      filter.catch(exception, mockArgumentsHost);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Test error message',
        code: 'WS_ERROR',
      });
    });

    it('should emit error for WsException with error object', () => {
      const errorObj = { message: 'Custom error', code: 'CUSTOM_CODE' };
      const exception = new WsException(errorObj);

      filter.catch(exception, mockArgumentsHost);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Custom error',
        code: 'CUSTOM_CODE',
      });
    });

    it('should emit error for validation exception', () => {
      const validationException = {
        response: {
          message: ['Field1 is required', 'Field2 must be a string'],
        },
      };

      filter.catch(validationException, mockArgumentsHost);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Field1 is required, Field2 must be a string',
        code: 'VALIDATION_ERROR',
      });
    });

    it('should emit error for validation exception with empty message array', () => {
      const validationException = {
        response: {},
      };

      filter.catch(validationException, mockArgumentsHost);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
      });
    });

    it('should emit error for generic Error instance', () => {
      const error = new Error('Something went wrong');

      filter.catch(error, mockArgumentsHost);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'Something went wrong',
        code: 'INTERNAL_ERROR',
      });
    });

    it('should emit error for unknown exception type', () => {
      const unknownException = 'just a string';

      filter.catch(unknownException, mockArgumentsHost);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'An unknown error occurred',
        code: 'UNKNOWN_ERROR',
      });
    });

    it('should emit error for null exception', () => {
      filter.catch(null, mockArgumentsHost);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'An unknown error occurred',
        code: 'UNKNOWN_ERROR',
      });
    });

    it('should emit error for undefined exception', () => {
      filter.catch(undefined, mockArgumentsHost);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'An unknown error occurred',
        code: 'UNKNOWN_ERROR',
      });
    });

    it('should emit error for object without response property', () => {
      const plainObject = { foo: 'bar' };

      filter.catch(plainObject, mockArgumentsHost);

      expect(mockSocket.emit).toHaveBeenCalledWith('error', {
        message: 'An unknown error occurred',
        code: 'UNKNOWN_ERROR',
      });
    });
  });
});
